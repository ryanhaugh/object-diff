import { CarTypeDescriptorRegistry } from './helpers/car-type-descriptor-registry';
import { Automobile } from './models/automobile';
import { AutomobileCollection } from './models/automobile-collection';
import { ChangeResult, ObjectDiffService } from './services/object-diff-service';

export class ObjectDiffExample {
  constructor(private readonly _objectDiff: ObjectDiffService) {}

  diff(): ChangeResult {
    const registry = new CarTypeDescriptorRegistry();

    const addedCar: Automobile = {
      id: 'added_car',
      make: 'ford',
      model: 'fiesta',
      year: 2022,
      msrp: 15000,
      features: [
        {
          id: 'feature_1',
          name: 'Power Windows',
          optional: true,
          cost: 2000,
          tags: ['tag_1'],
        },
      ],
    };

    const removedCar: Automobile = {
      id: 'removed_car',
      make: 'honda',
      model: 'civic',
      year: 2022,
      msrp: 15000,
      features: [
        {
          id: 'feature_1',
          name: 'Power Windows',
          optional: true,
          cost: 2000,
          tags: ['tag_1'],
        },
      ],
    };

    const modifiedCar: Automobile = {
      id: 'modified_car',
      make: 'toyota',
      model: 'corolla',
      year: 2022,
      msrp: 15000,
      features: [
        {
          id: 'feature_1',
          name: 'Power Windows',
          optional: true,
          cost: 2000,
          tags: ['tag_1'],
        },
      ],
    };

    const truck: Automobile = {
      id: 'truck_1',
      make: 'toyota',
      model: 'tacoma',
      year: 2022,
      msrp: 15000,
      features: [
        {
          id: 'feature_1',
          name: 'Power Windows',
          optional: true,
          cost: 2000,
          tags: ['tag_1'],
        },
      ],
    };

    const from: AutomobileCollection = {
      cars: [removedCar, modifiedCar],
      trucks: [truck],
    };

    const to: AutomobileCollection = {
      cars: [
        addedCar,
        {
          ...modifiedCar,
          msrp: 16000,
          salePrice: 14000,
        },
      ],
      trucks: [],
    };

    return this._objectDiff.diff(from, to, registry.automobileCollection);
  }
}
