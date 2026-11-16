import React from 'react';
import PrivacyPreference from './components/PrivacyPreference';
import {securityService, type LockTimeout} from '../../services/security';
import {settingsStorage} from '../../lib/storage';

export {PrivacyPreference, securityService, type LockTimeout};

/**
 * Security & Privacy Settings Screen Component
 * Enforces Biometric Authentication (Fingerprint / Face ID / PIN) and FLAG_SECURE App Masking.
 */
export const SecuritySettings: React.FC = () => {
  return <PrivacyPreference />;
};

export default SecuritySettings;
