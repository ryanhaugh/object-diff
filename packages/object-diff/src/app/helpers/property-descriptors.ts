export class PropertyDescriptors {
  static boolean<TProperty extends boolean | boolean[] | undefined = boolean>(): PropertyDescriptor<TProperty> {
    return {
      type: 'boolean',
    };
  }

  static complex<TProperty>(descriptor: TypeDescriptor<Unarray<TProperty>>): PropertyDescriptor<TProperty> {
    return {
      type: 'complex',
      descriptor: descriptor,
    };
  }

  static number<TProperty extends number | number[] | undefined = number>(): PropertyDescriptor<TProperty> {
    return {
      type: 'number',
    };
  }

  static string<TProperty extends string | string[] | undefined = string>(): PropertyDescriptor<TProperty> {
    return {
      type: 'string',
    };
  }
}

export class TypeDescriptors {
  static create<T>(config: TypeDescriptor<T>): TypeDescriptor<T> {
    for (const key of Object.keys(config.properties)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const property: PropertyDescriptor<unknown> = (config.properties as any)[key];
      property.name = key;
    }

    return config;
  }
}

export type PrimitiveType = 'boolean' | 'number' | 'string';

export type Unarray<T> = T extends Array<infer U> ? U : T;

export interface TypeDescriptor<T> {
  readonly name: string;
  readonly properties: TypeDescriptorPropertyMap<T>;
  readonly primaryKey?: keyof T | (keyof T)[];
}

export type TypeDescriptorPropertyMap<T> = { [P in keyof Required<T>]: PropertyDescriptor<T[P]> };

export interface PropertyDescriptor<TProperty> {
  readonly type: PrimitiveType | 'complex';
  readonly descriptor?: TypeDescriptor<Unarray<TProperty>>;
  name?: string;
}
