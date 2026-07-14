"use client";

const LOGO_SRC =
  "data:image/png;base64,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m8A17Xov+qqvYVft7Ih/NowFJDmqmPVQqVbwgVy/SDA5m/on6CvPfAr0DhppVmFc+AiqtXi0MBFmOOB9wNkjEbNFUUg8CW3J1ySzTQM/G53TnNFNF8+O3ApXBHa8wOU3V7NFUUg8AkApXKlhVdKYVv743oLonkhWUce6HgyHJIsez4SEViRQnvgVWeX+n3fy5OeCxSNJdlobnrdiVE3EcGui/+tuaIK7YEHgDs2t4VXXG3bRLGBM5/irralFuNr/vtBgK0RWUIxEoFfba+AN3bF1TJNvPXJWc0V0Vx9eOz8pOftBmgtROOxN5EIPNyzKHsTB+Seth9G5okR9NUFWUduTmwPt0slLxL9dyAigVedXepz97XwiRGphA2V5hO440qlVyJdU5ncE4jgfN3bmiuaEInAA8BDG24MuzW2beGzC3pvI6Wv79DA6fCCUxAEWGfYV3nF4pn1bnzJ/VxDd2Ik/EoBWFX6HoJciyg0LX4pNAdDuHjmm8DYmlqeH6C5rWnRMzXUfxqNN8/sRs34hmQd6Rt4YHGqmlZJwjahxkoSEZR9HxJc5XUUKcqorCY35X30fCz2xDbf99Ha/O6M1ahnbeGTCb3TsIDKRaiEpb8OmhulFCY/knSxeP7s58iR6cMTLYYZHz3V2aVOnzE5JEixVmta4CIYREREREREFCuRuKHncjihO56i/OjRyBY2Tj5zBOe6wUuuUaeANSuhbolu2AHdK1teiyYAwyuAElclizTTRMSefTCrSH8ax7FrEw9R7soQEREREVE8xfYkgyeyesX1BDWWRUvWEeQBcKRSjwYAiXiGPnYFj5OsIzh8BigO6y5laUnWAzd1xDLsQIwDD4yFXv9DJZYWM54tOxEREREREVHkVe3ZNi9MzU21jsRE/374uegB0NcLCMcur4mygOXLgRbdhSycqvwUj5OsI+gF0D8EgDOmrkwByxuB5dXbugNVHvhx7N5cm2oOOhEREREREVHk8ax8knA0xxv7J85sAJUHYXP0ZRIeiGnC0PcByJ0EyjFbVd9MAdevA5ormwz7VDwYlxEGPwBQ0FvLNZu08heDTkRERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERENCf/D1Ne4caJFwXNAAAAAElFTkSuQmCC";

export default function Logo({ size = 30, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <img
        src={LOGO_SRC}
        alt="Otherside"
        width={size}
        height={size}
        style={{ display: "block", flexShrink: 0, objectFit: "contain" }}
      />
      {withWordmark && (
        <span
          style={{
            fontWeight: 800,
            letterSpacing: 1.5,
            fontSize: 14,
            color: "var(--text)",
          }}
        >
          OTHERSIDE
        </span>
      )}
    </span>
  );
}
