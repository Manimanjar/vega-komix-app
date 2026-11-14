import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AppText from './ui/Text';
import {autoDomainResolver} from '../lib/network/autoDomainResolver';

interface CrashGuardBoundaryProps {
  children: React.ReactNode;
  screenName?: string;
  onGoBack?: () => void;
  domain?: string;
}

interface CrashGuardBoundaryState {
  hasError: boolean;
  error: Error | null;
  resolvingMirror: boolean;
}

export class CrashGuardBoundary extends React.Component<
  CrashGuardBoundaryProps,
  CrashGuardBoundaryState
> {
  constructor(props: CrashGuardBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      resolvingMirror: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<CrashGuardBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn(`[CrashGuardBoundary:${this.props.screenName || 'Unknown'}] Caught error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({hasError: false, error: null, resolvingMirror: false});
  };

  handleSwitchMirror = async () => {
    this.setState({resolvingMirror: true});
    try {
      if (this.props.domain) {
        await autoDomainResolver.resolveDomain(this.props.domain);
      } else {
        await autoDomainResolver.fetchRemoteDomainsRegistry();
      }
    } catch {}
    this.setState({hasError: false, error: null, resolvingMirror: false});
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="shield-alert-outline"
                size={44}
                color="#7C4DFF"
              />
            </View>

            <AppText role="titleLarge" style={styles.title}>
              Stream Guard Active
            </AppText>

            <AppText role="bodyMedium" style={styles.message}>
              {this.props.screenName ? `The ${this.props.screenName} screen` : 'This screen'} encountered an unexpected response from the comic provider. The app was protected from crashing.
            </AppText>

            {this.state.error?.message && (
              <View style={styles.errorBox}>
                <AppText role="bodySmall" style={styles.errorText} numberOfLines={3}>
                  {this.state.error.message}
                </AppText>
              </View>
            )}

            <View style={styles.buttonRow}>
              {this.props.onGoBack && (
                <TouchableOpacity
                  style={[styles.button, styles.secondaryButton]}
                  onPress={this.props.onGoBack}>
                  <MaterialCommunityIcons name="arrow-left" size={18} color="#E4E4E7" />
                  <AppText role="labelLarge" style={{color: '#E4E4E7'}}>
                    Go Back
                  </AppText>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={this.handleRetry}>
                <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
                <AppText role="labelLarge" style={{color: '#FFFFFF', fontWeight: '700'}}>
                  Retry
                </AppText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.mirrorButton}
              onPress={this.handleSwitchMirror}
              disabled={this.state.resolvingMirror}>
              <MaterialCommunityIcons
                name="swap-horizontal"
                size={16}
                color="#B388FF"
              />
              <AppText role="labelSmall" style={{color: '#B388FF', fontWeight: '700'}}>
                {this.state.resolvingMirror ? 'Probing Alternate Mirrors...' : 'Switch Mirror / Auto-Resolve TLD'}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

export default CrashGuardBoundary;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#18181B',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(124, 77, 255, 0.3)',
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(124, 77, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: '#A1A1AA',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  errorBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 18,
    borderLeftWidth: 3,
    borderLeftColor: '#FF5252',
  },
  errorText: {
    color: '#F87171',
    fontFamily: 'monospace',
    fontSize: 11,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  primaryButton: {
    backgroundColor: '#7C4DFF',
  },
  secondaryButton: {
    backgroundColor: '#27272A',
  },
  mirrorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
