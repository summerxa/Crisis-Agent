import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const SESSION_ID_STORAGE_KEY = 'crisisAgent.sessionId';

export async function getOrCreateSessionId() {
  const storedSessionId = await AsyncStorage.getItem(SESSION_ID_STORAGE_KEY);
  if (storedSessionId?.trim()) {
    return storedSessionId;
  }

  const sessionId = uuidv4();
  await AsyncStorage.setItem(SESSION_ID_STORAGE_KEY, sessionId);
  return sessionId;
}
