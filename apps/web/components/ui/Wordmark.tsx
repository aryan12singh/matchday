import Image from 'next/image';

/**
 * Theme-aware wordmark.
 *
 * design/assets/ ships two files for a reason: wordmark.svg has light strokes for dark
 * surfaces, wordmark-on-light.svg has dark ones. Using the dark-surface asset in light
 * mode renders the logo almost invisible, which is exactly what happened before this
 * existed.
 *
 * Both are rendered and CSS picks one, rather than switching in JavaScript — a
 * theme-dependent `src` would flash the wrong asset on every load, and the logo is the
 * first thing painted.
 */
export function Wordmark({
  width = 140,
  height = 24,
  priority = false,
}: {
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src="/wordmark.svg"
        alt="MatchDay"
        width={width}
        height={height}
        priority={priority}
        className="block light:hidden"
      />
      <Image
        src="/wordmark-on-light.svg"
        alt=""
        aria-hidden="true"
        width={width}
        height={height}
        priority={priority}
        className="hidden light:block"
      />
    </>
  );
}
