import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.coreylamb.unbiased',
  appName: 'Unbiased News',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: { contentInset: 'automatic', backgroundColor: '#ffffff' }
};
export default config;
