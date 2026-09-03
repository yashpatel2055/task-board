import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Card } from '../../types';

export interface CardEditResult {
  title: string;
  description: string;
  assignee: string;
  imageUri?: string;
}

interface Props {
  visible: boolean;
  editingCard: Card | null;
  onCancel: () => void;
  onSave: (result: CardEditResult) => void;
}

export function CardEditModal({ visible, editingCard, onCancel, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [imageUri, setImageUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setTitle(editingCard?.title ?? '');
      setDescription(editingCard?.description ?? '');
      setAssignee(editingCard?.assignee ?? '');
      setImageUri(editingCard?.imageUri);
    }
  }, [visible, editingCard]);

  const pickFromLibrary = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.7 });
    const uri = result.assets?.[0]?.uri;
    if (uri) setImageUri(uri);
  };

  const pickFromCamera = async () => {
    const result = await launchCamera({ mediaType: 'photo', quality: 0.7, saveToPhotos: false });
    const uri = result.assets?.[0]?.uri;
    if (uri) setImageUri(uri);
  };

  const canSave = title.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>{editingCard ? 'Edit card' : 'New card'}</Text>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title (required)"
            placeholderTextColor="#9ca3af"
            style={styles.input}
            autoFocus
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Description"
            placeholderTextColor="#9ca3af"
            style={[styles.input, styles.multiline]}
            multiline
          />
          <TextInput
            value={assignee}
            onChangeText={setAssignee}
            placeholder="Assignee"
            placeholderTextColor="#9ca3af"
            style={styles.input}
          />

          {imageUri ? (
            <View style={styles.imagePreviewWrap}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <Pressable onPress={() => setImageUri(undefined)} style={styles.removeImageBtn}>
                <Text style={styles.removeImageText}>Remove photo</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.attachRow}>
            <Pressable style={styles.attachBtn} onPress={pickFromCamera}>
              <Text style={styles.attachBtnText}>📷 Camera</Text>
            </Pressable>
            <Pressable style={styles.attachBtn} onPress={pickFromLibrary}>
              <Text style={styles.attachBtnText}>🖼 Gallery</Text>
            </Pressable>
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              disabled={!canSave}
              onPress={() =>
                onSave({ title: title.trim(), description: description.trim(), assignee: assignee.trim(), imageUri })
              }
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    color: '#111827',
  },
  multiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  imagePreviewWrap: {
    marginBottom: 10,
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  removeImageBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  removeImageText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },
  attachRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  attachBtn: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    borderRadius: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    backgroundColor: '#c7c9f5',
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
