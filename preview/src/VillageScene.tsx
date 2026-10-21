import { useEffect, useRef, useState } from "react";
import { blockedTilesForLevel, VILLAGE_COLS, VILLAGE_ROWS, villageLevelForCount } from "@/domain/village";
import { VillageSimulation } from "@/domain/village-sim";
import { sampleCharacters } from "./sample";

export function VillageScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const level = villageLevelForCount(sampleCharacters.length);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const blocked = blockedTilesForLevel(level.level);
    const simulation = new VillageSimulation(sampleCharacters, { blocked });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = performance.now();

    const paint = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = Math.round((width * VILLAGE_ROWS) / VILLAGE_COLS);
      canvas.style.height = `${height}px`;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = false;
      const tile = width / VILLAGE_COLS;
      for (let row = 0; row < VILLAGE_ROWS; row += 1) {
        for (let col = 0; col < VILLAGE_COLS; col += 1) {
          context.fillStyle = (col + row) % 2 === 0 ? "#d7ebc8" : "#c5e0b4";
          context.fillRect(col * tile, row * tile, tile + 0.5, tile + 0.5);
        }
      }
      for (const character of simulation.characters) {
        const x = character.col * tile + tile / 2;
        const y = character.row * tile + (character.state === "idle" ? Math.sin(character.bob / 180) * 1.5 : 0);
        context.fillStyle = "#2c2825";
        context.fillRect(x - 5, y - 10, 10, 12);
        context.fillStyle = "#f3c1c8";
        context.fillRect(x - 3, y - 16, 6, 6);
      }
    };

    const loop = (now: number) => {
      if (simulation.disposedFlag) {
        return;
      }
      const delta = Math.min(48, now - last);
      last = now;
      if (!reduced) {
        simulation.step(delta);
      }
      paint();
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    const selectAt = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const tile = rect.width / VILLAGE_COLS;
      const col = Math.floor((event.clientX - rect.left) / tile);
      const row = Math.floor((event.clientY - rect.top) / tile);
      const hit = simulation.characters.find((character) => character.col === col && character.row === row);
      setSelected(hit ? `${hit.name} · 샘플 인형. 저장소의 실제 인형이 아닙니다.` : null);
    };
    canvas.addEventListener("pointerdown", selectAt);
    return () => {
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener("pointerdown", selectAt);
      simulation.dispose();
    };
  }, [level.level]);

  return (
    <section className="pixel-border rounded-3xl bg-card p-3">
      <h2 className="text-lg font-bold">{level.name}</h2>
      <p className="text-sm text-ink/70">
        레벨 {level.level} · 샘플 인형 {sampleCharacters.length}개
      </p>
      <canvas ref={canvasRef} className="mt-2 w-full touch-none rounded-2xl bg-grass-soft" />
      <p className="mt-2 text-xs leading-5 text-ink/70">움직이는 그림은 기본 게임 캐릭터입니다. 실제 인형 사진이 아닙니다.</p>
      <p className="mt-2 text-sm text-ink/70">{selected ?? "캐릭터를 누르면 샘플 이름이 나타납니다."}</p>
    </section>
  );
}
