package com.vegakomix.app

import android.view.View
import android.view.ViewGroup
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.ViewManager

class VideoDecoderModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
    override fun getName() = "VideoDecoder"
    @ReactMethod fun getStatus(tag: Int, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            promise.resolve(Arguments.createMap())
        }
    }
    @ReactMethod fun setMode(tag: Int, mode: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            promise.resolve(Arguments.createMap())
        }
    }
}

class VideoDecoderPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(VideoDecoderModule(context))
    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
