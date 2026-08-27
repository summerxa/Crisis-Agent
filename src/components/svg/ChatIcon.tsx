import React from 'react';
import Svg, { Path } from 'react-native-svg';

export default function ChatIcon({ active }: { active: boolean }) {
  return (
    <Svg
      width={22}
      height={22}
      fill="none"
      stroke={active ? "#1B3A5C" : "#9EA3AF"}
      viewBox="0 0 24 24"
    >
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}
