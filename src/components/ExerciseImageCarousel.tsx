import { useRef, useState } from 'react';
import { Dimensions, FlatList, Image, StyleSheet, View } from 'react-native';

import exerciseImages from '../db/exerciseImages';

const SCREEN_WIDTH = Dimensions.get('window').width;

type Props = {
  exerciseId: string;
  customImageUris: string[] | null;
  height?: number;
};

type CarouselImage =
  | { type: 'static'; source: number }
  | { type: 'uri'; source: string };

// Carrousel photos partagé entre les écrans exercice (catalogue, programme,
// séance planifiée, séance live). Images statiques du dataset + photos
// personnalisées de l'exercice, pagination horizontale swipeable.
export function ExerciseImageCarousel({ exerciseId, customImageUris, height = 220 }: Props) {
  const [imageIndex, setImageIndex] = useState(0);
  const flatListRef = useRef<FlatList<CarouselImage>>(null);

  const staticImages: CarouselImage[] = (exerciseImages[exerciseId] ?? []).map((source) => ({
    type: 'static',
    source,
  }));
  const customImages: CarouselImage[] = (customImageUris ?? []).map((uri) => ({
    type: 'uri',
    source: uri,
  }));
  const allImages = [...staticImages, ...customImages];

  if (allImages.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={allImages}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setImageIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
        }}
        renderItem={({ item }) => (
          <Image
            source={item.type === 'static' ? item.source : { uri: item.source }}
            style={[styles.image, { height }]}
            resizeMode="contain"
          />
        )}
      />
      {allImages.length > 1 && (
        <View style={styles.dots}>
          {allImages.map((_, i) => (
            <View key={i} style={[styles.dot, i === imageIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff' },
  image: { width: SCREEN_WIDTH },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#ddd' },
  dotActive: { backgroundColor: '#007AFF', width: 18 },
});
