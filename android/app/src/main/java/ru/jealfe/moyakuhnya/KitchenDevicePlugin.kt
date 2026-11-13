
package ru.jealfe.moyakuhnya

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.activity.result.ActivityResult
import androidx.core.view.WindowCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.UUID

@CapacitorPlugin(name = "KitchenDevice")
class KitchenDevicePlugin : Plugin() {
    private val prefs get() = context.getSharedPreferences("kitchen_backup", 0)
    private val permission = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION

    @PluginMethod
    fun setTheme(call: PluginCall) {
        val light = call.getBoolean("light", false) == true
        activity.runOnUiThread {
            val window = activity.window
            window.decorView.setBackgroundColor(Color.parseColor(if (light) "#f6f2e8" else "#181a15"))
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            controller.isAppearanceLightStatusBars = light
            controller.isAppearanceLightNavigationBars = light
            call.resolve()
        }
    }

    private fun folder() = prefs.getString("folder", null)?.let(Uri::parse)

    @PluginMethod
    fun backupStatus(call: PluginCall) {
        call.resolve(JSObject().put("enabled", folder() != null))
    }

    @PluginMethod
    fun chooseBackupFolder(call: PluginCall) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(permission or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(call, intent, "folderChosen")
    }

    @ActivityCallback
    private fun folderChosen(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("enabled", folder() != null).put("cancelled", true))
            return
        }
        try {
            context.contentResolver.takePersistableUriPermission(uri, permission)
            val previous = folder()
            if (previous != uri) {
                check(prefs.edit().putString("folder", uri.toString()).remove("slot").commit())
                if (previous != null) release(previous)
            }
            call.resolve(JSObject().put("enabled", true))
        } catch (_: Exception) {
            call.reject("Не удалось подключить папку. Выберите папку с доступом на запись.")
        }
    }

    private fun release(uri: Uri) {
        try { context.contentResolver.releasePersistableUriPermission(uri, permission) }
        catch (_: SecurityException) { }
    }

    @PluginMethod
    fun disableBackup(call: PluginCall) {
        val previous = folder()
        if (!prefs.edit().remove("folder").remove("slot").commit()) {
            call.reject("Не удалось отключить автокопию.")
            return
        }
        if (previous != null) release(previous)
        call.resolve()
    }

    @PluginMethod
    fun writeBackup(call: PluginCall) {
        val content = call.getString("content")
        val tree = folder()
        if (tree == null || content == null) {
            call.reject("Выберите папку для автокопии.")
            return
        }
        try {
            val resolver = context.contentResolver
            val installation = prefs.getString("installation", null) ?: UUID.randomUUID().toString().take(8).also {
                check(prefs.edit().putString("installation", it).commit())
            }
            val slot = 1 - prefs.getInt("slot", 1)
            val name = "moya-kuhnya-$installation-$slot.json"
            val treeId = DocumentsContract.getTreeDocumentId(tree)
            val directory = DocumentsContract.buildDocumentUriUsingTree(tree, treeId)
            val children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeId)
            val columns = arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME)
            val existing = resolver.query(children, columns, null, null, null)?.use { cursor ->
                var found: Uri? = null
                while (cursor.moveToNext()) {
                    if (cursor.getString(1) == name) {
                        found = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0))
                        break
                    }
                }
                found
            }
            val target = existing ?: DocumentsContract.createDocument(resolver, directory, "application/json", name)
                ?: error("Document could not be created")
            val stream = resolver.openOutputStream(target, "wt") ?: error("Document is not writable")
            stream.bufferedWriter(Charsets.UTF_8).use { it.write(content) }
            check(prefs.edit().putInt("slot", slot).commit())
            call.resolve(JSObject().put("name", name))
        } catch (_: Exception) {
            call.reject("Автокопия не записана. Проверьте доступ к папке и свободное место.")
        }
    }
}
