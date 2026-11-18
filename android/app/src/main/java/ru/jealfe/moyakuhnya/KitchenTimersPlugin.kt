package ru.jealfe.moyakuhnya

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

private const val prefsName = "kitchen_timers"
private const val loudChannel = "cooking_timers"
private const val quietChannel = "cooking_timers_silent"
private const val reviewChannel = "cooking_reviews"
private const val reviewScheme = "kitchen-review"

private fun alarmIntent(context: Context, key: String) =
    Intent(context, KitchenTimerReceiver::class.java).setData(Uri.Builder().scheme("kitchen-timer").authority("end").appendPath(key).build())

private fun canSchedulePrecisely(alarms: AlarmManager) =
    Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()

private fun scheduleAlarm(alarms: AlarmManager, end: Long, pending: PendingIntent) {
    if (canSchedulePrecisely(alarms)) {
        try {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, pending)
            return
        } catch (_: SecurityException) {
            // Android can revoke exact alarm access between the check and scheduling.
        }
    }
    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, pending)
}

@CapacitorPlugin(name = "KitchenTimers", permissions = [
    Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])
])
class KitchenTimersPlugin : Plugin() {
    private val alarms get() = context.getSystemService(AlarmManager::class.java)
    private fun exact() = canSchedulePrecisely(alarms)

    private fun statusObject(): JSObject {
        val manager = context.getSystemService(NotificationManager::class.java)
        val enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
        fun available(id: String) = Build.VERSION.SDK_INT < 26 ||
            manager.getNotificationChannel(id)?.importance != NotificationManager.IMPORTANCE_NONE
        return JSObject().put("enabled", enabled).put("exact", exact())
            .put("soundAvailable", enabled && available(loudChannel))
            .put("silentAvailable", enabled && available(quietChannel))
            .put("reviewAvailable", enabled && available(reviewChannel))
    }

    override fun handleOnNewIntent(intent: Intent) {
        val data = intent.data ?: return
        if (data.scheme != reviewScheme || data.authority != "open") return
        val id = data.lastPathSegment ?: return
        if (!Regex("^[a-z0-9][a-z0-9_-]{0,79}$").matches(id)) return
        notifyListeners("reviewOpen", JSObject().put("id", id), true)
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 33 && !statusObject().getBoolean("enabled")) {
            requestPermissionForAlias("notifications", call, "notificationsResult")
        } else call.resolve(statusObject())
    }

    @PermissionCallback
    private fun notificationsResult(call: PluginCall) = call.resolve(statusObject())

    @PluginMethod
    fun openSettings(call: PluginCall) {
        val intent = if (call.getBoolean("exact", false) == true && Build.VERSION.SDK_INT >= 31) {
            Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
        } else if (Build.VERSION.SDK_INT >= 26) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
        activity.runOnUiThread {
            try {
                activity.startActivity(intent)
                call.resolve()
            } catch (_: Exception) {
                call.reject("Не удалось открыть настройки Android.")
            }
        }
    }

    @PluginMethod
    fun sync(call: PluginCall) {
        val desired = call.getArray("timers") ?: run { call.reject("Не переданы таймеры."); return }
        val records = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val manager = context.getSystemService(NotificationManager::class.java)
        val keys = mutableSetOf<String>()
        val flags = PendingIntent.FLAG_IMMUTABLE
        val precise = exact()
        for (index in 0 until desired.length()) {
            val timer = desired.getJSONObject(index)
            val key = timer.getString("key")
            val end = timer.getLong("end")
            if (end <= System.currentTimeMillis()) {
                if (records.contains(key)) keys.add(key)
                continue
            }
            keys.add(key)
            val token = JSONObject(timer.toString()).put("exact", precise).toString()
            val intent = alarmIntent(context, key)
            val existing = PendingIntent.getBroadcast(context, 0, intent, flags or PendingIntent.FLAG_NO_CREATE)
            if (existing != null && token == records.getString(key, null)) continue
            if (timer.has("review")) manager.cancel(key, 0)
            records.edit().putString(key, token).apply()
            val pending = PendingIntent.getBroadcast(context, 0, intent.putExtra("end", end), flags or PendingIntent.FLAG_UPDATE_CURRENT)
            scheduleAlarm(alarms, end, pending)
        }
        for (key in records.all.keys - keys) {
            val pending = PendingIntent.getBroadcast(context, 0, alarmIntent(context, key), flags or PendingIntent.FLAG_NO_CREATE)
            if (pending != null) {
                alarms.cancel(pending)
                pending.cancel()
            }
            records.edit().remove(key).apply()
            manager.cancel(key, 0)
        }
        call.resolve(statusObject())
    }
}

class KitchenTimerReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val key = intent.data?.lastPathSegment ?: return
        val records = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val record = records.getString(key, null)?.let(::JSONObject) ?: return
        val end = record.getLong("end")
        if (record.optBoolean("delivered") || end != intent.getLongExtra("end", -1) || end > System.currentTimeMillis()) return
        val review = record.optString("review")
        if (review.isEmpty()) records.edit().remove(key).apply()
        else records.edit().putString(key, record.put("delivered", true).toString()).apply()
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return

        val isReview = review.isNotEmpty()
        val sound = !isReview && record.optBoolean("sound", true)
        val channel = if (isReview) reviewChannel else if (sound) loudChannel else quietChannel
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            val name = if (isReview) "Отзывы о готовке" else if (sound) "Таймеры готовки" else "Таймеры без звука"
            val importance = if (isReview) NotificationManager.IMPORTANCE_DEFAULT else NotificationManager.IMPORTANCE_HIGH
            val category = NotificationChannel(channel, name, importance)
            if (!isReview && !sound) {
                category.setSound(null, null)
                category.enableVibration(false)
            }
            manager.createNotificationChannel(category)
        }
        val open = Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (isReview) open.data = Uri.Builder().scheme(reviewScheme).authority("open").appendPath(review).build()
        val click = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(record.getString("recipe"))
            .setContentText(if (isReview) "Попробовали блюдо? Запишите впечатления." else "Таймер завершён · " + record.getString("name"))
            .setCategory(if (isReview) NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_ALARM)
            .setPriority(if (isReview) NotificationCompat.PRIORITY_DEFAULT else NotificationCompat.PRIORITY_HIGH)
            .setDefaults(if (sound) NotificationCompat.DEFAULT_SOUND else 0)
            .setContentIntent(click)
            .setAutoCancel(true)
            .build()
        try { manager.notify(key, 0, notification) } catch (_: SecurityException) { }
    }
}

class KitchenReviewRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val records = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        val alarms = context.getSystemService(AlarmManager::class.java)
        for ((key, value) in records.all) {
            if (!key.startsWith("review:") || value !is String) continue
            val record = JSONObject(value)
            if (record.optBoolean("delivered")) continue
            val end = record.getLong("end")
            val alarm = alarmIntent(context, key).putExtra("end", end)
            val pending = PendingIntent.getBroadcast(context, 0, alarm,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            scheduleAlarm(alarms, maxOf(end, System.currentTimeMillis()), pending)
        }
    }
}
