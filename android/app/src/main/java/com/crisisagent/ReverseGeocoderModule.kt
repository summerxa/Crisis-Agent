package com.crisisagent

import android.location.Address
import android.location.Geocoder
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class ReverseGeocoderModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ReverseGeocoder"

  @ReactMethod
  fun reverseGeocode(latitude: Double, longitude: Double, promise: Promise) {
    if (!Geocoder.isPresent()) {
      promise.resolve(null)
      return
    }

    val geocoder = Geocoder(reactContext, Locale.getDefault())
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        geocoder.getFromLocation(latitude, longitude, 1, object : Geocoder.GeocodeListener {
          override fun onGeocode(addresses: MutableList<Address>) {
            promise.resolve(formatAddress(addresses.firstOrNull()))
          }

          override fun onError(errorMessage: String?) {
            promise.resolve(null)
          }
        })
        return
      }

      @Suppress("DEPRECATION")
      val addresses = geocoder.getFromLocation(latitude, longitude, 1)
      promise.resolve(formatAddress(addresses?.firstOrNull()))
    } catch (_: Exception) {
      promise.resolve(null)
    }
  }

  private fun formatAddress(address: android.location.Address?): Any? {
    val city = address?.locality?.trim()
      ?: address?.subAdminArea?.trim()
      ?: address?.adminArea?.trim()
    val country = address?.countryName?.trim()

    if (city.isNullOrEmpty() || country.isNullOrEmpty()) return null

    return Arguments.createMap().apply {
      putString("city", city)
      putString("country", country)
      putString("label", "$city, $country")
    }
  }
}
