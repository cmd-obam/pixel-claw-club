export interface PixelFriend {
  slot: 1 | 2 | 3;
  name: string;
  rows: string[];
}

// 캐릭터를 늘릴 때는 이 목록, club_characters 행, member_credentials.character_slot 제약을 함께 늘린다.

export const pixelPalette: Record<string, string> = {
  k: "#2c2825",
  p: "#ff9ebb",
  d: "#ff5f8f",
  w: "#fffdf8",
  y: "#ffe08a",
  b: "#c4846a",
  n: "#ffd7c2",
  s: "#8fd0ff",
  g: "#b7e4c7",
};

export const pixelFriends: PixelFriend[] = [
  {
    slot: 1,
    name: "냥집게",
    rows: [
      "......kkkk......",
      "....kkppppkk....",
      "...kppppppppk...",
      "..kppppppppppk..",
      "..kpkwppkwpppk..",
      "..kppppppppppk..",
      "..kpppddpppppk..",
      "...kppppppppk...",
      "....kkppppkk....",
      "...kppppppppk...",
      "..kpyyppppyypk..",
      "..kpyyppppyypk..",
      "...kk.kkkk.kk...",
      "................",
      "................",
      "................",
    ],
  },
  {
    slot: 2,
    name: "곰하트",
    rows: [
      "..kk........kk..",
      ".kbbk......kbbk.",
      "kbbbbk....kbbbbk",
      "kbbbbbk..kbbbbbk",
      ".kbbbbkkkkbbbbk.",
      "..kbbbbbbbbbbk..",
      "..kbwwkbbkwwbk..",
      "..kbbbbbbbbbbk..",
      "..kbbbddbbbbbk..",
      "...kbbbbbbbbk...",
      "....kbbbbbbk....",
      ".....kkddkk.....",
      "......kddk......",
      ".......kk.......",
      "................",
      "................",
    ],
  },
  {
    slot: 3,
    name: "토끼별",
    rows: [
      "....kk....kk....",
      "...kwwk..kwwk...",
      "...kwwk..kwwk...",
      "...kwwkkkkwwk...",
      "....kwwwwwwk....",
      "...kkwwwwwwkk...",
      "..kwkwkwwkwkwk..",
      "..kwwwwwwwwwwk..",
      "..kwwwddwwwwwk..",
      "...kwwwwwwwwk...",
      "....kkyyykk.....",
      ".....kyyyk......",
      ".....kkykk......",
      "......kkkk......",
      "................",
      "................",
    ],
  },
];
