import { AutomobileFeature } from './automobile-feature';

export interface Automobile {
  id: string;
  make: AutomobileMake;
  model: string;
  year: number;
  msrp: number;
  features: AutomobileFeature[];
  salePrice?: number;
}

export type AutomobileMake = 'ford' | 'honda' | 'toyota';
