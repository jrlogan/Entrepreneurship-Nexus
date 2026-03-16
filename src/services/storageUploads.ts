import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getStorageClient, isFirebaseEnabled } from './firebaseApp';

const sanitizeFileName = (fileName: string) => fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

export const uploadImageFile = async (
  file: File,
  pathSegments: string[]
): Promise<string> => {
  if (!isFirebaseEnabled()) {
    throw new Error('Firebase Storage is not configured for this environment.');
  }

  const storage = getStorageClient();
  if (!storage) {
    throw new Error('Firebase Storage is not available.');
  }

  const path = [...pathSegments, `${Date.now()}-${sanitizeFileName(file.name)}`].join('/');
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/octet-stream',
  });
  return getDownloadURL(storageRef);
};
