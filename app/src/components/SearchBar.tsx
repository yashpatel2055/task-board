import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

/** Filters cards by keyword (title/description) or assignee, across every column at once. */
export function SearchBar({ value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search title, description, or assignee..."
        placeholderTextColor="#9ca3af"
        style={styles.input}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
});
