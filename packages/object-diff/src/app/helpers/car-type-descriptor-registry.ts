import { Automobile } from '../models/automobile';
import { AutomobileCollection } from '../models/automobile-collection';
import { AutomobileFeature } from '../models/automobile-feature';
import { PropertyDescriptors, TypeDescriptors } from './property-descriptors';

export class CarTypeDescriptorRegistry {
  get automobile() {
    return TypeDescriptors.create<Automobile>({
      name: 'Automobile',
      primaryKey: 'id',
      properties: {
        id: PropertyDescriptors.string(),
        make: PropertyDescriptors.string(),
        model: PropertyDescriptors.string(),
        year: PropertyDescriptors.number(),
        msrp: PropertyDescriptors.number(),
        features: PropertyDescriptors.complex(this.automobileFeature),
        salePrice: PropertyDescriptors.number(),
      },
    });
  }

  get automobileCollection() {
    return TypeDescriptors.create<AutomobileCollection>({
      name: 'AutomobileCollection',
      properties: {
        cars: PropertyDescriptors.complex(this.automobile),
        trucks: PropertyDescriptors.complex(this.automobile),
      },
    });
  }

  get automobileFeature() {
    return TypeDescriptors.create<AutomobileFeature>({
      name: 'AutomobileFeature',
      primaryKey: 'id',
      properties: {
        id: PropertyDescriptors.string(),
        name: PropertyDescriptors.string(),
        optional: PropertyDescriptors.boolean(),
        cost: PropertyDescriptors.number(),
        tags: PropertyDescriptors.string(),
      },
    });
  }
}
