import React, { useEffect } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BoardScreen } from './src/screens/BoardScreen';
import { startSyncEngine } from './src/services/queueProcessor';

function App(): React.JSX.Element {
  useEffect(() => {
    const stop = startSyncEngine();
    return stop;
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <View style={styles.flex}>
          <StatusBar barStyle="dark-content" />
          <BoardScreen />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default App;
