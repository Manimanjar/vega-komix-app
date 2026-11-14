import React from 'react';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../App';
import {ReaderScreen} from './ReaderScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

export default function Player(props: Props): React.JSX.Element {
  return <ReaderScreen {...props} />;
}
export {ReaderScreen};
