import React from 'react';
import Svg, { Path } from 'react-native-svg';

export default function HomeIcon({ active }: { active: boolean }) {
  return (
    <Svg
      width={22}
      height={22}
      fill="none"
      stroke={active ? "#1B3A5C" : "#9EA3AF"}
      viewBox="0 0 24 24"
    >
      <Path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Path d="M9 22V12h6v10" />
    </Svg>
  );
}
