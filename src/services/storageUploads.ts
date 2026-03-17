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

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Upload timed out. Is the Storage emulator running? (firebase emulators:start --only firestore,functions,storage,auth)')), 15000)
  );

  await Promise.race([
    uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream' }),
    timeout,
  ]);
  return getDownloadURL(storageRef);
};
