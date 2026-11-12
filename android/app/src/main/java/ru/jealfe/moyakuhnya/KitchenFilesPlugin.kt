package ru.jealfe.moyakuhnya

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "KitchenFiles")
class KitchenFilesPlugin : Plugin() {
    @PluginMethod
    fun save(call: PluginCall) {
        val content = call.getString("content")
        val name = call.getString("name")
        if (content == null || name == null || !name.matches(Regex("[a-zA-Z0-9_.-]+\\.json"))) {
            call.reject("Не удалось подготовить JSON."); return
        }
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_TITLE, name)
        }
        startActivityForResult(call, intent, "saved")
    }

    @ActivityCallback
    private fun saved(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("cancelled", true)); return
        }
        bridge.execute {
            try {
                val stream = context.contentResolver.openOutputStream(uri, "wt")
                    ?: throw IllegalStateException()
                stream.bufferedWriter(Charsets.UTF_8).use { it.write(call.getString("content")!!) }
                call.resolve(JSObject().put("saved", true))
            } catch (_: Exception) { call.reject("Не удалось сохранить файл. Выберите другую папку.") }
        }
    }
}
