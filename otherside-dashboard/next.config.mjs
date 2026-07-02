/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fonts load at runtime via <link>; skip build-time font inlining so
  // builds succeed in restricted-network environments too.
  optimizeFonts: false,
};
export default nextConfig;
