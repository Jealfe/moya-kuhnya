package ru.jealfe.moyakuhnya

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

@CapacitorPlugin(name = "KitchenFiles")
class KitchenFilesPlugin : Plugin() {
    @PluginMethod
    fun save(call: PluginCall) {
        val content = call.getString("content")
        val name = call.getString("name")
        if (content == null || name == null || !name.matches(Regex("[a-zA-Z0-9_.-]+\\.json"))) {
            call.reject("Не удалось подготовить JSON."); return
        }
        val staged = try {
            val directory = File(context.cacheDir, "pending-json").apply { mkdirs() }
            File.createTempFile("export-", ".json", directory).also { file ->
                try { file.bufferedWriter(Charsets.UTF_8).use { it.write(content) } }
                catch (error: Exception) { file.delete(); throw error }
            }
        } catch (_: Exception) {
            call.reject("Не удалось подготовить файл копии. Проверьте свободное место.")
            return
        }
        // Capacitor serializes the pending call into Android's saved activity state.
        call.data.remove("content")
        call.data.put("stagedFile", staged.name)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_TITLE, name)
        }
        try {
            startActivityForResult(call, intent, "saved")
        } catch (_: Exception) {
            staged.delete()
            call.reject("Не удалось открыть окно сохранения. Попробуйте «Поделиться копией».")
        }
    }

    @PluginMethod
    fun share(call: PluginCall) {
        val name = call.getString("name")
        val content = call.getString("content")
        if (name == null || content == null || !name.matches(Regex("[a-zA-Z0-9_.-]+\\.json"))) {
            call.reject("Не удалось подготовить копию.")
            return
        }
        try {
            val directory = File(context.cacheDir, "backup-share").apply { mkdirs() }
            val file = File(directory, name)
            file.bufferedWriter(Charsets.UTF_8).use { it.write(content) }
            val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "application/json"
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri(name, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.runOnUiThread {
                try {
                    activity.startActivity(Intent.createChooser(share, "Поделиться копией"))
                    call.resolve()
                } catch (_: Exception) {
                    call.reject("Не удалось открыть меню отправки копии.")
                }
            }
        } catch (_: Exception) {
            call.reject("Не удалось подготовить файл копии. Проверьте свободное место.")
        }
    }

    @ActivityCallback
    private fun saved(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val stagedName = call.getString("stagedFile")
        if (stagedName == null || !stagedName.matches(Regex("export-[0-9]+\\.json"))) {
            call.reject("Временный файл копии недоступен. Повторите сохранение.")
            return
        }
        val staged = File(File(context.cacheDir, "pending-json"), stagedName)
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            staged.delete()
            call.resolve(JSObject().put("cancelled", true)); return
        }
        bridge.execute {
            try {
                val stream = context.contentResolver.openOutputStream(uri, "wt")
                    ?: throw IllegalStateException()
                stream.use { destination -> staged.inputStream().use { it.copyTo(destination) } }
                call.resolve(JSObject().put("saved", true))
            } catch (_: Exception) {
                call.reject("Не удалось записать файл. Выберите другую папку или нажмите «Поделиться копией».")
            } finally {
                staged.delete()
            }
        }
    }
}
