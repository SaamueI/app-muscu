import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Tabs } from 'expo-router';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        headerShown: useClientOnlyValue(false, true),
      }}>
      <Tabs.Screen
        name="calendrier"
        options={{
          title: 'Calendrier',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="calendar-today" color={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="programmes"
        options={{
          title: 'Programmes',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="format-list-bulleted" color={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="mesocycle"
        options={{
          title: 'Mésocycle',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="layers" color={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="exercices"
        options={{
          title: 'Exercices',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="fitness-center" color={color} size={28} />
          ),
        }}
      />
      <Tabs.Screen
        name="progression"
        options={{
          title: 'Progression',
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="trending-up" color={color} size={28} />
          ),
        }}
      />
    </Tabs>
  );
}
