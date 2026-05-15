import { INestiaConfig } from '@nestia/sdk'

const NESTIA_CONFIG: INestiaConfig = {
  input: ['src/presentation/*.controller.ts'],
  output: 'src/api',
}
export default NESTIA_CONFIG
