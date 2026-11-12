package ru.jealfe.moyakuhnya

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.SocketTimeoutException
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLException

@CapacitorPlugin(name = "GigaChat")
class GigaChatPlugin : Plugin() {
    private val worker = Executors.newSingleThreadExecutor()
    private val busy = AtomicBoolean(false)
    private val cancelled = AtomicBoolean(false)
    @Volatile private var connection: HttpsURLConnection? = null
    private lateinit var secrets: SecretStore
    private lateinit var client: GigaClient
    private val preferences get() = context.getSharedPreferences("gigachat_options", 0)
    private val model get() = preferences.getString("model", "GigaChat-2")!!
    private val scope get() = preferences.getString("scope", "GIGACHAT_API_PERS")!!

    override fun load() {
        secrets = SecretStore(context)
        client = GigaClient(GigaTransport(::send), { secrets.read() }, { scope })
    }
    private fun statusObject() = JSObject().put("hasKey", secrets.hasKey()).put("model", model).put("scope", scope)
    private fun execute(call: PluginCall, work: () -> JSObject) {
        if (!busy.compareAndSet(false, true)) { call.reject("Дождитесь завершения текущего запроса."); return }
        cancelled.set(false)
        worker.execute {
            try {
                val result = work()
                if (cancelled.get()) throw GigaFailure("Запрос отменён.")
                call.resolve(result)
            } catch (error: Exception) {
                // Never send exception details, response bodies, URLs with auth, or credentials to the bridge/logs.
                call.reject(when {
                    cancelled.get() -> "Запрос отменён."
                    error is GigaFailure -> error.message ?: "Ошибка GigaChat."
                    error is SSLException -> "Не удалось проверить сертификат GigaChat. Проверьте дату устройства и обновите приложение."
                    error is SocketTimeoutException -> "Истекло время ожидания GigaChat. Повторите запрос."
                    error is java.io.IOException -> "Нет связи с GigaChat. Проверьте интернет и повторите запрос."
                    error is java.security.GeneralSecurityException -> "Защищённое хранилище недоступно. Удалите ключ и введите его снова."
                    else -> "Не удалось обработать ответ или сохранить настройки. Повторите действие."
                })
            } finally { connection?.disconnect(); connection = null; busy.set(false) }
        }
    }
    @PluginMethod fun status(call: PluginCall) = execute(call) { statusObject() }
    @PluginMethod fun saveKey(call: PluginCall) = execute(call) {
        var value = call.getString("key")?.trim()?.removePrefix("Basic ") ?: ""
        // The authorization key is Base64(client_id:client_secret), not an access token.
        if (value.length !in 8..8192 || !value.matches(Regex("[A-Za-z0-9+/]+={0,2}"))) throw GigaFailure("Введите ключ авторизации GigaChat в формате Base64.")
        call.data.remove("key")
        saveOptions(call)
        secrets.save(value); value = ""; client.clearToken()
        statusObject()
    }
    private fun saveOptions(call: PluginCall) {
        val selectedModel = call.getString("model") ?: model
        val selectedScope = call.getString("scope") ?: scope
        if (!selectedModel.matches(Regex("[A-Za-z0-9_.:-]{1,100}")) || selectedScope !in listOf("GIGACHAT_API_PERS", "GIGACHAT_API_B2B", "GIGACHAT_API_CORP")) throw GigaFailure("Проверьте модель и тип доступа.")
        if (selectedScope != scope) client.clearToken()
        check(preferences.edit().putString("model", selectedModel).putString("scope", selectedScope).commit())
    }
    @PluginMethod fun configure(call: PluginCall) = execute(call) { saveOptions(call); statusObject() }
    @PluginMethod fun deleteKey(call: PluginCall) = execute(call) { secrets.delete(); client.clearToken(); statusObject() }
    @PluginMethod fun checkConnection(call: PluginCall) = execute(call) {
        val models = client.models()
        statusObject().put("models", JSArray(models)).put("connected", true)
    }
    @PluginMethod fun analyze(call: PluginCall) = execute(call) {
        val payload = call.getObject("payload") ?: throw GigaFailure("Не переданы данные отзыва.")
        if (payload.toString().length > 50_000) throw GigaFailure("Данные анализа слишком велики.")
        val schema = context.assets.open("public/data/ai-result.schema.json").bufferedReader().use { JSONObject(it.readText()) }
        JSObject().put("content", client.analyze(payload, schema, model))
    }
    @PluginMethod fun cancel(call: PluginCall) {
        if (busy.get()) { cancelled.set(true); connection?.disconnect() }
        call.resolve()
    }
    private fun send(url: String, body: String?, headers: Map<String, String>): GigaResponse {
        if (cancelled.get()) throw GigaFailure("Запрос отменён.")
        require(url == GigaClient.OAUTH || url.startsWith(GigaClient.API))
        val current = URL(url).openConnection() as HttpsURLConnection
        connection = current
        try {
            current.connectTimeout = 15_000
            current.readTimeout = 60_000
            current.instanceFollowRedirects = false
            current.requestMethod = if (body == null) "GET" else "POST"
            headers.forEach { (name, value) -> current.setRequestProperty(name, value) }
            if (cancelled.get()) throw GigaFailure("Запрос отменён.")
            if (body != null) {
                current.doOutput = true
                val bytes = body.toByteArray(Charsets.UTF_8)
                current.setFixedLengthStreamingMode(bytes.size)
                current.outputStream.use { it.write(bytes) }
            }
            val code = current.responseCode
            // Discard error bodies: they may echo request content or authorization details.
            if (code !in 200..299) return GigaResponse(code, "")
            val response = current.inputStream.use { stream ->
                val output = ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                val deadline = System.nanoTime() + 60_000_000_000L
                while (true) {
                    if (cancelled.get()) throw GigaFailure("Запрос отменён.")
                    if (System.nanoTime() > deadline) throw SocketTimeoutException()
                    val count = stream.read(buffer)
                    if (count < 0) break
                    if (output.size() + count > 1_048_576) throw GigaFailure("Ответ GigaChat слишком велик.")
                    output.write(buffer, 0, count)
                }
                output.toString("UTF-8")
            }
            if (cancelled.get()) throw GigaFailure("Запрос отменён.")
            return GigaResponse(code, response)
        } finally { current.disconnect(); connection = null }
    }
    override fun handleOnDestroy() {
        cancelled.set(true); connection?.disconnect(); worker.shutdownNow(); client.clearToken()
        super.handleOnDestroy()
    }
}
