package ru.jealfe.moyakuhnya

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class GigaClientTest {
    @Test fun tokenIsReusedAndRefreshedBeforeExpiry() {
        var now = 1_000L
        var oauth = 0
        val transport = GigaTransport { url, body, headers ->
            if (url == GigaClient.OAUTH) {
                oauth++
                assertEquals("scope=GIGACHAT_API_PERS", body)
                assertEquals("Basic test-key", headers["Authorization"])
                assertNotNull(headers["RqUID"])
                GigaResponse(200, """{"access_token":"token-$oauth","expires_at":${now+120000}}""")
            } else {
                assertEquals(GigaClient.API+"models",url)
                assertEquals("Bearer token-$oauth",headers["Authorization"])
                GigaResponse(200,"""{"data":[{"id":"GigaChat-2"},{"id":"Embeddings"}]}""")
            }
        }
        val client=GigaClient(transport,{"test-key"},{"GIGACHAT_API_PERS"},{now})
        assertEquals(listOf("GigaChat-2"),client.models())
        client.models(); assertEquals(1,oauth)
        now+=61000;client.models();assertEquals(2,oauth)
        client.clearToken();client.models();assertEquals(3,oauth)
    }
    @Test fun unauthorizedRefreshesOnlyOnce() {
        var oauth=0;var requests=0
        val client=GigaClient(GigaTransport { url,_,_ ->
            if(url==GigaClient.OAUTH){oauth++;GigaResponse(200,"""{"access_token":"token","expires_at":9999999999999}""")}
            else {requests++;GigaResponse(401,"")}
        },{"test-key"},{"GIGACHAT_API_PERS"})
        assertThrows(GigaFailure::class.java){client.models()}
        assertEquals(2,oauth);assertEquals(2,requests)
    }
    @Test fun forbiddenDoesNotLoopOrExposeResponseBody() {
        val client=GigaClient(GigaTransport { _,_,_ -> GigaResponse(403,"sensitive-response-must-not-escape") },{"test-key"},{"GIGACHAT_API_PERS"})
        val failure=assertThrows(GigaFailure::class.java){client.models()}
        assertFalse(failure.message!!.contains("sensitive-response"))
    }
    @Test fun analysisUsesOfficialJsonSchemaFormatAndFixedEndpoints() {
        val client=GigaClient(GigaTransport { url,body,_ ->
            if(url==GigaClient.OAUTH) GigaResponse(200,"""{"access_token":"token","expires_at":9999999999999}""")
            else {
                assertEquals("https://api.giga.chat/v1/chat/completions",url)
                val request=JSONObject(body!!)
                assertEquals("json_schema",request.getJSONObject("response_format").getString("type"))
                assertTrue(request.getJSONObject("response_format").getBoolean("strict"))
                assertEquals(2,request.getJSONArray("messages").length())
                val instructions=request.getJSONArray("messages").getJSONObject(0).getString("content")
                assertTrue(instructions.contains("без Markdown"))
                assertTrue(instructions.contains(request.getJSONObject("response_format").getJSONObject("schema").toString()))
                GigaResponse(200,"""{"choices":[{"finish_reason":"stop","message":{"content":"{}"}}]}""")
            }
        },{"test-key"},{"GIGACHAT_API_PERS"})
        assertEquals("{}",client.analyze(JSONObject(),JSONObject().put("type","object"),"GigaChat-2"))
    }
    @Test fun truncatedResponseIsNotTreatedAsCompletedAnalysis() {
        val client=GigaClient(GigaTransport { url,_,_ ->
            if(url==GigaClient.OAUTH) GigaResponse(200,"""{"access_token":"token","expires_at":9999999999999}""")
            else GigaResponse(200,"""{"choices":[{"finish_reason":"length","message":{"content":"{"}}]}""")
        },{"test-key"},{"GIGACHAT_API_PERS"})
        assertThrows(GigaFailure::class.java){client.analyze(JSONObject(),JSONObject(),"GigaChat-2")}
    }

    @Test fun emptyContentHasAnActionableError() {
        val client=GigaClient(GigaTransport { url,_,_ ->
            if(url==GigaClient.OAUTH) GigaResponse(200,"""{"access_token":"token","expires_at":9999999999999}""")
            else GigaResponse(200,"""{"choices":[{"finish_reason":"stop","message":{"content":"  "}}]}""")
        },{"test-key"},{"GIGACHAT_API_PERS"})
        val failure=assertThrows(GigaFailure::class.java){client.analyze(JSONObject(),JSONObject(),"GigaChat-2")}
        assertTrue(failure.message!!.contains("пустой ответ"))
    }
}
