import { ObjectDiffExample } from './app/object-diff-example';
import { ConsoleLogger } from './app/services/console-logger';
import { ObjectDiffService } from './app/services/object-diff-service';

const logger = new ConsoleLogger();
const objectDiff = new ObjectDiffService(logger);

const objectDiffExample = new ObjectDiffExample(objectDiff);

console.log(JSON.stringify(objectDiffExample.diff(), null, 2));
