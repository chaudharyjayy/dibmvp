export default function LandingPage() {
  return (
    <main className="flex-1 bg-white text-zinc-900 overflow-hidden">
      <code-rain
        source="/ascii-editor/demos/generated/ref-006.webp"
        width={window.innerWidth}
        height={window.innerHeight}
        cellSize={14}
        renderMode="characters"
        charSet="binary"
        bgMode="solid"
        bgBlur={12}
        bgOpacity={90}
        coverage={96}
        tint="#ff0000"
        tintOpacity={45}
        animated={true}
      />
    </main>
  );
}