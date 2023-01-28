/* eslint-disable @typescript-eslint/no-explicit-any */
import { find, intersection, isEqual, isNil, size, sortBy } from 'lodash';
import { PropertyDescriptor, TypeDescriptor } from '../helpers/property-descriptors';
import { AbstractLogger } from './abstract-logger';

export class ObjectDiffService {
  constructor(private readonly _logger: AbstractLogger) {}

  diff<TRoot>(from: TRoot, to: TRoot, descriptor: TypeDescriptor<TRoot>): ChangeResult {
    const changeResult: ChangeResult = {};
    this._processChanges<TRoot, TRoot>(changeResult, from, to, from, to, descriptor);
    return changeResult;
  }

  private _getChanges<T extends Record<string, ObjectLike>>(
    fromArray: T[],
    toArray: T[],
    primaryKeys: string[],
  ): Changes<T> {
    const fromKeyValues = this._getPrimaryKeyValues(fromArray, primaryKeys);
    const toKeyValues = this._getPrimaryKeyValues(toArray, primaryKeys);
    const matched = intersection(fromKeyValues, toKeyValues);

    const result: Changes<T> = {
      removed: fromArray.filter((item) => !matched.includes(this._getPrimaryKeyValue(item, primaryKeys))),
      added: toArray.filter((item) => !matched.includes(this._getPrimaryKeyValue(item, primaryKeys))),
      inBoth: matched.map((keyValue: string) => {
        const from = find(fromArray, (item) => this._getPrimaryKeyValue(item, primaryKeys) === keyValue);
        const to = find(toArray, (item) => this._getPrimaryKeyValue(item, primaryKeys) === keyValue);

        if (!from || !to) {
          throw Error(`Uh oh...something didn't go right`);
        }

        return {
          primaryKey: keyValue,
          from: from,
          to: to,
        };
      }),
    };

    return result;
  }

  private _getPrimaryKeyValue<T extends Record<string, ObjectLike>>(item: T, primaryKeys: string[]): string {
    let result = '';

    for (const primaryKey of sortBy(primaryKeys)) {
      result += `${primaryKey}:${(item[primaryKey] || '').toString().toLowerCase()};`;
    }

    return result;
  }

  private _getPrimaryKeyValues<T extends Record<string, ObjectLike>>(items: T[], primaryKeys: string[]): string[] {
    const keyValues: string[] = [];

    for (const item of items) {
      keyValues.push(this._getPrimaryKeyValue(item, primaryKeys));
    }

    return sortBy(keyValues);
  }

  private _processChanges<TRoot, TProperty>(
    changeResult: ChangeResult,
    fromRoot: TRoot,
    toRoot: TRoot,
    from: TProperty,
    to: TProperty,
    descriptor: TypeDescriptor<any>,
  ): void {
    for (const key of sortBy(Object.keys(descriptor.properties))) {
      const propertyDescriptor = (descriptor.properties as Record<string, PropertyDescriptor<TProperty>>)[key];
      const primaryKeys = ObjectDiffService._toArray(propertyDescriptor.descriptor?.primaryKey);

      const fromPropertyValue = (from as any)[key];
      const toPropertyValue = (to as any)[key];

      const propertyDescriptorName = propertyDescriptor.name;

      if (!propertyDescriptorName) {
        this._logger.error(`Property descriptors need a property name (property: '${descriptor.name}').`);
        return;
      }

      switch (propertyDescriptor.type) {
        case 'complex': {
          const propertyTypeDescriptor = propertyDescriptor.descriptor;

          if (!propertyTypeDescriptor) {
            this._logger.error(
              `Property descriptors for complex properties need a type descriptor (property: '${descriptor.name}.${propertyDescriptorName}').`,
            );
            return;
          }

          if (!primaryKeys) {
            this._logger.error(
              `Property descriptors for complex arrays need a primaryKey (property: '${descriptor.name}.${propertyDescriptorName}').`,
            );
            return;
          }

          if (Array.isArray(fromPropertyValue) && Array.isArray(toPropertyValue)) {
            const changes = this._getChanges(fromPropertyValue, toPropertyValue, primaryKeys);

            if (changes.removed.length || changes.added.length) {
              if (!changeResult[propertyDescriptorName]) {
                changeResult[propertyDescriptorName] = [
                  ...changes.removed.map((item) => {
                    const transformedItem: Record<string, unknown> = {};
                    this._processComplexTypeTransformations(transformedItem, fromRoot, item, propertyTypeDescriptor);

                    return {
                      '-': transformedItem,
                    };
                  }),
                  ...changes.added.map((item) => {
                    const transformedItem: Record<string, unknown> = {};
                    this._processComplexTypeTransformations(transformedItem, toRoot, item, propertyTypeDescriptor);

                    return {
                      '+': transformedItem,
                    };
                  }),
                ];
              }
            }

            for (const change of changes.inBoth) {
              const itemChangeResult: ChangeResult = {};

              this._processChanges(itemChangeResult, fromRoot, toRoot, change.from, change.to, propertyTypeDescriptor);

              if (size(itemChangeResult) > 0) {
                const itemChangeResultFinal: ChangeResult = {};

                for (const primaryKey of primaryKeys) {
                  itemChangeResultFinal[primaryKey] = change.from[primaryKey];
                }

                for (const key in itemChangeResult) {
                  itemChangeResultFinal[key] = itemChangeResult[key];
                }

                if (!changeResult[propertyDescriptorName]) {
                  changeResult[propertyDescriptorName] = [];
                }

                const changeResultItem = changeResult[propertyDescriptorName];

                if (Array.isArray(changeResultItem)) {
                  changeResultItem.push(itemChangeResultFinal);
                }
              }
            }
          } else {
            if (!isNil(fromPropertyValue) || !isNil(toPropertyValue)) {
              throw Error(`Unexpected non-array complex type: '${propertyDescriptorName}'`);
            }
          }

          break;
        }
        // It's a primitive value
        default: {
          const fromPropertyValue = (from as any)[propertyDescriptorName];
          const toPropertyValue = (to as any)[propertyDescriptorName];

          if (Array.isArray(fromPropertyValue) && Array.isArray(toPropertyValue)) {
            const matched = intersection(
              fromPropertyValue.map((item) => JSON.stringify(item)),
              toPropertyValue.map((item) => JSON.stringify(item)),
            );
            const removedItems = fromPropertyValue.filter((item) => !matched.includes(JSON.stringify(item)));
            const addedItems = toPropertyValue.filter((item) => !matched.includes(JSON.stringify(item)));

            if (removedItems.length || addedItems.length) {
              changeResult[propertyDescriptorName] = [];
              const changeResultItem = changeResult[propertyDescriptorName];

              if (Array.isArray(changeResultItem)) {
                if (removedItems.length) {
                  changeResultItem.push({
                    '-': sortBy(removedItems),
                  });
                }

                if (addedItems.length) {
                  changeResultItem.push({
                    '+': sortBy(addedItems),
                  });
                }
              }
            }
          } else {
            if (!isEqual(fromPropertyValue, toPropertyValue)) {
              changeResult[propertyDescriptorName] = {
                '-': fromPropertyValue,
                '+': toPropertyValue,
              };
            }
          }
        }
      }
    }
  }

  private _processComplexTypeTransformations<TRoot, TProperty>(
    result: Record<string, unknown>,
    root: TRoot,
    property: TProperty,
    descriptor: TypeDescriptor<TProperty>,
  ): void {
    for (const key of sortBy(Object.keys(descriptor.properties))) {
      const propertyDescriptor = (descriptor.properties as Record<string, PropertyDescriptor<TProperty>>)[key];
      const propertyDescriptorName = propertyDescriptor.name;

      if (!propertyDescriptorName) {
        this._logger.error(`Property descriptors need a property name (property: '${descriptor.name}').`);
        return;
      }

      const propertyValue = (property as any)[key];

      switch (propertyDescriptor.type) {
        case 'complex': {
          const propertyTypeDescriptor = propertyDescriptor.descriptor;

          if (!propertyTypeDescriptor) {
            this._logger.error(
              `Property descriptors for complex properties need a type descriptor (property: '${descriptor.name}.${propertyDescriptorName}').`,
            );
            return;
          }

          if (Array.isArray(propertyValue)) {
            const itemResults: Record<string, unknown>[] = [];

            for (const propertyValueItem of propertyValue) {
              const itemResult: Record<string, unknown> = {};

              this._processComplexTypeTransformations(itemResult, root, propertyValueItem, propertyTypeDescriptor);

              if (!isNil(itemResult)) {
                itemResults.push(itemResult);
              }
            }

            if (itemResults.length) {
              result[propertyDescriptorName] = itemResults;
            }
          } else {
            if (!isNil(propertyValue)) {
              throw Error(`Unexpected non-array complex type: '${propertyDescriptorName}'`);
            }
          }

          break;
        }
        // It's a primitive value
        default: {
          const propertyValue = (property as any)[propertyDescriptorName];

          if (!isNil(propertyValue)) {
            result[propertyDescriptorName] = propertyValue;
          }
        }
      }
    }
  }

  private static _toArray<T extends ObjectLike>(value: T | T[] | undefined): string[] | undefined {
    if (!value) {
      return undefined;
    }

    return !Array.isArray(value) ? [value.toString()] : value.map((item) => item.toString());
  }
}

export type ChangeResult = Record<string, unknown | unknown[]>;

interface Changes<T> {
  removed: T[];
  added: T[];
  inBoth: {
    primaryKey: string;
    from: T;
    to: T;
  }[];
}

type ObjectLike = {
  toString(): string;
};
