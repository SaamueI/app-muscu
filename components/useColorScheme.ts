import { useColorScheme as useColorSchemeCore } from 'react-native';

// React Native renvoie `null` / `undefined` tant que le thème système n'est pas
// résolu ; on retombe sur 'light' pour que le retour soit toujours une clé
// valide de `constants/Colors`.
export const useColorScheme = (): 'light' | 'dark' => useColorSchemeCore() ?? 'light';
