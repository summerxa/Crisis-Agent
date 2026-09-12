import CoreLocation
import React

@objc(ReverseGeocoder)
class ReverseGeocoder: NSObject {
  private let geocoder = CLGeocoder()

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc(reverseGeocode:longitude:resolver:rejecter:)
  func reverseGeocode(
    _ latitude: NSNumber,
    longitude: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let location = CLLocation(latitude: latitude.doubleValue, longitude: longitude.doubleValue)

    geocoder.reverseGeocodeLocation(location) { placemarks, error in
      if let error = error {
        reject("reverse_geocode_failed", error.localizedDescription, error)
        return
      }

      guard let placemark = placemarks?.first else {
        resolve(nil)
        return
      }

      let city = [placemark.locality, placemark.subAdministrativeArea, placemark.administrativeArea]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .first { !$0.isEmpty }
      let country = placemark.country?.trimmingCharacters(in: .whitespacesAndNewlines)

      guard let city = city, let country = country, !country.isEmpty else {
        resolve(nil)
        return
      }

      resolve([
        "city": city,
        "country": country,
        "label": "\(city), \(country)"
      ])
    }
  }
}
