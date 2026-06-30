/**
 * Type-level smoke tests for my-smart.
 * Validated by `tsc --noEmit` — no test runner required.
 */

import { SmartService } from '../my-plus/my-smart/my-smart';
import { SMART_READY_MESSAGE } from '../my-plus/my-smart/core/smart-paths';

// smart-paths.ts — constant exists and is a string
const readyMsg: string = SMART_READY_MESSAGE;

// smart-service.ts — class compiles and methods exist
const smart = new SmartService();
const root: string | undefined = undefined;
smart.writeRules(root, 'rules');
smart.prepareContext(root, 'claude');
smart.cleanup(root);

void readyMsg;
void root;
