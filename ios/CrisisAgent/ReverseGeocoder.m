#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ReverseGeocoder, NSObject)

RCT_EXTERN_METHOD(reverseGeocode:(nonnull NSNumber *)latitude
                  longitude:(nonnull NSNumber *)longitude
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
