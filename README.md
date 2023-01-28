# Auditable JSON Changes

At one of my previous jobs we were manipulating a lot of JSON data and we needed an audit trail of every change that was made to a JSON objects.

My first thought was to simply save a copy of the JSON data each time a change was made so we can see how the data changes over time. This will most certainly work, but it creates two problems:

- This will consume a lot of disk space over time
- How do we easily determine what was changed in a large file?

We can do better.

I began thinking about how **git** works. It doesn't save copies of a file every time it changes - it simply saves the delta between the previous and current versions:

```diff
-   const value = 'this is the old value';
+   const value = 'this is the new value';
```

What if we do a similar thing for JSON data?

Let's assume we're saving data about a car dealership and have the following object:

```js
// Original Data
{
  "cars": [
    {
      "id": "car_1",
      "brand": "toyota",
      "model": "corolla",
      "year": 2022,
      "msrp": 19000
    },
    {
      "id": "car_2",
      "brand": "honda",
      "model": "civic",
      "year": 2023,
      "msrp": 18000
    }
  ]
}
```

Let's change the `msrp` of `car_1`:

```js
// Modified Data
{
  "cars": [
    {
      "id": "car_1",
      "brand": "toyota",
      "model": "corolla",
      "year": 2022,
      "msrp": 21000 // This value changed
    },
    {
      "id": "car_2",
      "brand": "honda",
      "model": "civic",
      "year": 2023,
      "msrp": 18000
    }
  ]
}
```

Alrighty, let's use git's technique to determine the difference between these two:

```diff
-   "msrp": 19000
+   "msrp": 21000
```

Hmm... That's not useful. Which `car` changed their `msrp`?

Using the exact same diff technique as git won't work for us. Data objects require **_context_**.

In other words, we need to know which object experienced the change. Our diff needs to look something like this:

```js
{
  // car objects are part of the 'cars' array
  "cars": [
    {
      "id": "car_1", // car_1 changed its msrp
      "msrp": {
        "-": 19000,
        "+": 21000
      }
    }
  ]
}
```

Note that we're not including whole `car_1` object - just the primary key (`id`) and the modified property (`msrp`).

How do we implement this?

First, let's use TypeScript. This allows us to implement guardrails in our code that will make our life so much easier. You'll see what I mean later on.

Second, let's look at the different data types we need to compare (we could always expand on this later on to account for special types like `Date`):

- `primitive` (`boolean`, `number`, `string`)
- `complex` (i.e. a nested JSON object)
  - We need to identify primary keys (e.g. `car_1` or `car_2`)
- `array`
  - Can be array of `primitive` or `complex`
  - We need to account for items being in a different order

Next, let's determine how the logic should work:

- Define a method that allows us to pass in two objects of the same type (i.e. a `from` and a `to` object)
- Iterate through the properties and perform a comparison based on their type
  - We can compare `primitive` directly
  - We must recursively call our object diff method for `complex` types
- If an entire `complex` object was removed, include the entire object in the diff
- Return the differences

Say we have the following object:

```js
{
  "id": "car_1",
  "make": "ford",
  "model": "fiesta",
  "year": 2022,
  "msrp": 15000,
  "features": [
    {
      "id": "feature_1",
      "name": "Power Windows",
      "optional": true,
      "cost": 2000,
      "tags": ["tag_1"]
    }
  ]
}
```

The TypeScript definition would be:

```ts
export interface Automobile {
  id: string;
  make: AutomobileMake;
  model: string;
  year: number;
  msrp: number;
  features: AutomobileFeature[];
  salePrice?: number; // This property may or may not be present
}

export type AutomobileMake = 'ford' | 'honda' | 'toyota';

export interface AutomobileFeature {
  id: string;
  name: string;
  optional: boolean;
  cost: number;
  tags: string[];
}
```

Now we can pass in two `Automobile` objects to our object diff service:

```ts
export class ObjectDiffService {
  diff(from: Automobile, to: Automobile) {
    // Compare 'from' and 'to' and return the difference
  }
}
```

This is great if we're only ever going to compare `Automobile` objects, but let's assume we're going to compare other object types:

```ts
export class ObjectDiffService {
  diff(from: any, to: any) {
    // Compare 'from' and 'to' and return the difference
  }
}
```

This is better, but we're not guaranteeing that we're comparing two objects of the same type:

```ts
const objectDiff = new ObjectDiffService();

const from: Automobile = {...};
const to: NotAnAutomobile = {...};

objectDiff.diff(from, to);
```

Let's fix that:

```ts
export class ObjectDiffService {
  diff<T>(from: T, to: T) {
    // Compare 'from' and 'to' and return the difference
  }
}
```

By using `generics` we ensure that the `from` and `to` are the same type.

This is a great start, but poses a few questions:

- How do we know what a complex object's primary keys are?
- How do we account for optional properties (e.g. `Automobile.salePrice`)?
  - We'd need to look at both the `from` and `to` objects to ensure we've captured all of the properties

What if we **_described_** each object type?

How can we describe `Automobile` and `AutomobileFeature` in a clear and concise way?

Let's introduce the concept of a `TypeDescriptor` and a `PropertyDescriptor`:

```ts
interface TypeDescriptor<T> {
  readonly name: string;
  readonly properties: TypeDescriptorPropertyMap<T>;
  readonly primaryKey?: keyof T | (keyof T)[];
}

type PrimitiveType = 'boolean' | 'number' | 'string';

type TypeDescriptorPropertyMap<T> = {
  [P in keyof T]: PropertyDescriptor<T[P]>;
};

interface PropertyDescriptor<TProperty> {
  readonly type: PrimitiveType | 'complex';
  readonly name: string;
  readonly descriptor?: TypeDescriptor<TProperty>;
}
```

A `TypeDescriptor` describes a complex `type`:

- `name`: the name of the type. Since TypeScript transpiles to plain JavaScript, we lose all type information at runtime
- `properties`: describes the type's properties.
- `primaryKey`: identifies the type's primary keys

A `PropertyDescriptor` describes a type's `properties`:

- `type`: describes a property's type (`boolean`, `number`, `string`, `complex`)
- `name`: the name of the property
- `descriptor`: indicates a `complex` property's `TypeDescriptor`

Let's see this in action:

```ts
export class AutomobileTypeDescriptorRegistry {
  get automobile(): TypeDescriptor<Automobile> {
    return {
      name: 'Automobile',
      primaryKey: 'id',
      properties: {
        id: {
          name: 'notId',
          type: 'string',
        },
        make: {
          name: 'make',
          type: 'number',
        },
        model: {
          name: 'model',
          type: 'string',
        },
        year: {
          name: 'year',
          type: 'number',
        },
        msrp: {
          name: 'msrp',
          type: 'number',
        },
        features: {
          name: 'features',
          type: 'complex',
          descriptor: this.automobileFeature,
        },
      },
    };
  }

  get automobileFeature(): TypeDescriptor<AutomobileFeature> {
    return {
      name: 'AutomobileFeature',
      primaryKey: 'id',
      properties: {
        id: {
          name: 'id',
          type: 'string',
        },
        name: {
          name: 'name',
          type: 'string',
        },
        optional: {
          name: 'optional',
          type: 'boolean',
        },
        cost: {
          name: 'cost',
          type: 'number',
        },
        tags: {
          name: 'tags',
          type: 'string',
        },
      },
    };
  }
}
```

This can work, but it's verbose and there is potential for many different errors:

- We need to define the name of the property in the property descriptor even though we already know it:

  ```ts
  {
    id: {
      name: 'id', // This is redundant because we already know the name
      type: 'string',
    }
  }
  ```

  - This means we could accidentally type in the incorrect name for the property. Did you notice the property name for `Automobile.id` above? It's set to `notId` instead of `id`

- We may describe a property with the incorrect type. For example, `Autombile.make` is set to `number` when it should be set to `string`
- We may forget to include a property. `Automobile` has the property `salePrice`, but its descriptor doesn't describe it.

Let's address the missing property first. `TypeDescriptor.properties` is of type `TypeDescriptorPropertyMap<T>`:

```ts
type TypeDescriptorPropertyMap<T> = {
  [P in keyof T]: PropertyDescriptor<T[P]>;
};
```

`{ [P in keyof T]: PropertyDescriptor<T[P]> }` means the type is an object, but every property key (`P`) must exist in the property `T`, where `T` could be, say, `Automobile`. What this _doesn't_ say is that _every_ property in `T` must be included in the object. We can fix this by changing `TypeDescriptorPropertyMap<T>` to:

```ts
// '[P in keyof T] was changed to `[P in keyof Required<T>]`
export type TypeDescriptorPropertyMap<T> = {
  [P in keyof Required<T>]: PropertyDescriptor<T[P]>;
};
```

Now the TypeScript compiler will complain when we accidentally miss a property.

Next, let's tackle the verbosity and the potential for choosing the incorrect type because they go hand-in-hand. Rather than using an object for each property, we can create a helper class:

```ts
export class PropertyDescriptors {
  static boolean<TProperty extends boolean | boolean[] | undefined = boolean>(
    name: string
  ): PropertyDescriptor<TProperty> {
    return {
      name: name,
      type: 'boolean',
    };
  }

  static complex<TProperty>(
    name: string,
    descriptor: TypeDescriptor<Unarray<TProperty>>
  ): PropertyDescriptor<TProperty> {
    return {
      name: name,
      type: 'complex',
      descriptor: descriptor,
    };
  }

  static number<TProperty extends number | number[] | undefined = number>(
    name: string
  ): PropertyDescriptor<TProperty> {
    return {
      name: name,
      type: 'number',
    };
  }

  static string<TProperty extends string | string[] | undefined = string>(
    name: string
  ): PropertyDescriptor<TProperty> {
    return {
      name: name,
      type: 'string',
    };
  }
}
```

Let's go deep on one of the helper methods:

```ts
static boolean<TProperty extends boolean | boolean[] | undefined = boolean> { ... }
```

What we're saying is "in order to use this method, `TProperty` must be of type `boolean`, `boolean[]`, or `undefined`.", That means this one method will work with `boolean` properties that could also be arrays or optional. Using this in conjunction with `TypeDescriptorPropertyMap<T>` means we're letting TypeScript do a lot of the heavy lifting because it will infer the property's type for us and complain if we try to use this helper method with a non-`boolean` property type.

Pretty neat, right?

This allows use to rewrite the descriptors as:

```ts
export class AutomobileTypeDescriptorRegistry {
  get automobile(): TypeDescriptor<Automobile> {
    return {
      name: 'Automobile',
      primaryKey: 'id',
      properties: {
        id: PropertyDescriptors.string('id'),
        make: PropertyDescriptors.string('make'),
        model: PropertyDescriptors.string('model'),
        year: PropertyDescriptors.number('year'),
        msrp: PropertyDescriptors.number('msrp'),
        features: PropertyDescriptors.complex(
          'features',
          this.automobileFeature
        ),
        salePrice: PropertyDescriptors.number('salePrice'),
      },
    };
  }

  get automobileFeature(): TypeDescriptor<AutomobileFeature> {
    return {
      name: 'AutomobileFeature',
      primaryKey: 'id',
      properties: {
        id: PropertyDescriptors.string('id'),
        name: PropertyDescriptors.string('name'),
        optional: PropertyDescriptors.boolean('optional'),
        cost: PropertyDescriptors.number('cost'),
        tags: PropertyDescriptors.string('tags'),
      },
    };
  }
}
```

That's _much_ cleaner. But we still have the problem of redundantly passing in the property's name to the helper methods, which means we could still pass in an incorrect name. Let's tackle that next:

```ts
export class TypeDescriptors {
  static create<T>(config: TypeDescriptor<T>): TypeDescriptor<T> {
    for (const key of Object.keys(config.properties)) {
      const property: PropertyDescriptor<unknown> = (config.properties as any)[
        key
      ];
      property.name = key;
    }

    return config;
  }
}
```

This helper method allows us to pass in a `TypeDescriptor`, where it will iterate over all of the keys in the `properties` object and automatically set each underlying property descriptor's `name` property to be the corresponding `key` value.

This gives us:

```ts
export class AutomobileTypeDescriptorRegistry {
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
```

Now we have a way to describe any object type in an error-free way.

Our object diff service now looks like this:

```ts
export class ObjectDiffService {
  diff<T>(from: T, to: T, descriptor: TypeDescriptor<T>) {
    // Compare 'from' and 'to' and return the difference
  }
}
```

We need to pass in `TypeDescriptor<T>` that corresponds to the type of `from` and `to` so the diff logic knows how to diff the object.

There is a lot of logic in the object differ, so I will leave that to you to look at: `object-diff-service.ts`.

### Example

First I'm going to add another object to improve the result:

```ts
export interface AutomobileCollection {
  cars: Automobile[];
  trucks: Automobile[];
}

export class AutomobileTypeDescriptorRegistry {
  // ... Other descriptors we've already written
  get automobileCollection() {
    return TypeDescriptors.create<AutomobileCollection>({
      name: 'AutomobileCollection',
      properties: {
        cars: PropertyDescriptors.complex(this.automobile),
        trucks: PropertyDescriptors.complex(this.automobile),
      },
    });
  }
}
```

`from`:

```js
{
  "cars": [
    {
      "id": "removed_car",
      "make": "honda",
      "model": "civic",
      "year": 2022,
      "msrp": 15000,
      "features": [
        {
          "id": "feature_1",
          "name": "Power Windows",
          "optional": true,
          "cost": 2000,
          "tags": ["tag_1"]
        }
      ]
    },
    {
      "id": "modified_car",
      "make": "toyota",
      "model": "corolla",
      "year": 2022,
      "msrp": 15000,
      "features": [
        {
          "id": "feature_1",
          "name": "Power Windows",
          "optional": true,
          "cost": 2000,
          "tags": ["tag_1"]
        }
      ]
    }
  ],
  "trucks": [
    {
      "id": "removed_truck",
      "make": "toyota",
      "model": "tacoma",
      "year": 2022,
      "msrp": 15000,
      "features": [
        {
          "id": "feature_1",
          "name": "Power Windows",
          "optional": true,
          "cost": 2000,
          "tags": ["tag_1"]
        }
      ]
    }
  ]
}
```

`to`:

```js
{
  "cars": [
    {
      "id": "added_car",
      "make": "ford",
      "model": "fiesta",
      "year": 2022,
      "msrp": 15000,
      "features": [
        {
          "id": "feature_1",
          "name": "Power Windows",
          "optional": true,
          "cost": 2000,
          "tags": ["tag_1"]
        }
      ]
    },
    {
      "id": "modified_car",
      "make": "toyota",
      "model": "corolla",
      "year": 2022,
      "msrp": 16000,
      "features": [
        {
          "id": "feature_1",
          "name": "Power Windows",
          "optional": true,
          "cost": 2000,
          "tags": ["tag_1"]
        }
      ],
      "salePrice": 14000
    }
  ],
  "trucks": []
}
```

```ts
const registry = new CarTypeDescriptorRegistry();
const objectDiff = new ObjectDiffService();

const changes = objectDiff.diff(from, to, registry.automobileCollection);
```

Result:

```js
{
  "cars": [
    {
      "-": {
        "features": [
          {
            "cost": 2000,
            "id": "feature_1",
            "name": "Power Windows",
            "optional": true,
            "tags": ["tag_1"]
          }
        ],
        "id": "removed_car",
        "make": "honda",
        "model": "civic",
        "msrp": 15000,
        "year": 2022
      }
    },
    {
      "+": {
        "features": [
          {
            "cost": 2000,
            "id": "feature_1",
            "name": "Power Windows",
            "optional": true,
            "tags": ["tag_1"]
          }
        ],
        "id": "added_car",
        "make": "ford",
        "model": "fiesta",
        "msrp": 15000,
        "year": 2022
      }
    },
    {
      "id": "modified_car",
      "msrp": {
        "-": 15000,
        "+": 16000
      },
      "salePrice": {
        "+": 14000
      }
    }
  ],
  "trucks": [
    {
      "-": {
        "features": [
          {
            "cost": 2000,
            "id": "feature_1",
            "name": "Power Windows",
            "optional": true,
            "tags": ["tag_1"]
          }
        ],
        "id": "removed_truck",
        "make": "toyota",
        "model": "tacoma",
        "msrp": 15000,
        "year": 2022
      }
    }
  ]
}
```
