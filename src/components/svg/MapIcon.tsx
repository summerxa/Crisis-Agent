import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export default function MapIcon({ active }: { active: boolean }) {
  return (
    <Svg
      width={22}
      height={22}
      fill="none"
      stroke={active ? "#1B3A5C" : "#9EA3AF"}
      viewBox="0 0 24 24"
    >
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx={12} cy={10} r={3} />
    </Svg>
  );
}
