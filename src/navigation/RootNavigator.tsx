import React, { useState } from 'react';
import { HomeScreen } from '../screens/HomeScreen';
import { CardScreen } from '../screens/CardScreen';
import { Deck } from '../repositories/DeckRepository';

type Screen =
  | { name: 'Home' }
  | { name: 'Card'; deck: Deck };

export function RootNavigator() {
  const [screen, setScreen] = useState<Screen>({ name: 'Home' });

  switch (screen.name) {
    case 'Card':
      return (
        <CardScreen
          deck={screen.deck}
          onBack={() => setScreen({ name: 'Home' })}
        />
      );
    case 'Home':
    default:
      return (
        <HomeScreen
          onDeckPress={(deck) => setScreen({ name: 'Card', deck })}
        />
      );
  }
}