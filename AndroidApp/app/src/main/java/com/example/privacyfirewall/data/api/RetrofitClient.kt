package com.example.privacyfirewall.data.api

import com.example.privacyfirewall.BuildConfig
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    /** Retry interceptor — retries up to 2 times on IOException */
    private val retryInterceptor = Interceptor { chain ->
        val request = chain.request()
        var response: okhttp3.Response? = null
        var lastException: IOException? = null

        for (attempt in 0..2) {
            try {
                response = chain.proceed(request)
                if (response.isSuccessful || attempt == 2) break
                response.close()
            } catch (e: IOException) {
                lastException = e
                if (attempt == 2) throw e
            }
        }

        response ?: throw (lastException ?: IOException("Request failed after retries"))
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(retryInterceptor)
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val api: PrivacyFirewallApi = retrofit.create(PrivacyFirewallApi::class.java)
}
