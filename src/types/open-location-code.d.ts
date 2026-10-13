declare module "open-location-code" {
  export class OpenLocationCode {
    isFull(code: string): boolean;
    recoverNearest(code: string, referenceLatitude: number, referenceLongitude: number): string;
    decode(code: string): {
      latitudeCenter: number;
      longitudeCenter: number;
    };
  }
}
