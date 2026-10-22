"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { haversineMeters } from "@/domain/stores";
import type { PublicMapConfig } from "@/server/config";
import type { MapPlaceView } from "@/server/engine/queries";

const NEARBY_METERS = 3000;

type FilterId = "all" | "nearby" | "visited" | "revenge";
type NaverMap = {
  setCenter: (position: object) => void;
  panTo: (position: object) => void;
  setZoom: (zoom: number, smooth?: boolean) => void;
  getZoom: () => number;
  getBounds: () => { getSW: () => { lat: () => number; lng: () => number }; getNE: () => { lat: () => number; lng: () => number } };
};
type NaverMarker = { setMap: (map: NaverMap | null) => void };
type NaverNamespace = {
  maps: {
    Map: new (node: HTMLElement, options: object) => NaverMap;
    LatLng: new (latitude: number, longitude: number) => object;
    Point: new (x: number, y: number) => object;
    Marker: new (options: object) => NaverMarker;
    Event: {
      addListener: (target: object, event: string, handler: () => void) => object;
      removeListener: (listener: object) => void;
      trigger: (target: object, event: string) => void;
    };
  };
};

type NaverWindow = Window & {
  naver?: NaverNamespace;
  navermap_authFailure?: () => void;
};

const filters: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "nearby", label: "내 주변" },
  { id: "visited", label: "방문한 곳" },
  { id: "revenge", label: "복수 대상" },
];

let naverLoader: Promise<void> | null = null;

function appendMapScript(clientId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.dataset.naverMap = "ncpKeyId";
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("naver map script failed"));
    document.head.appendChild(script);
  });
}

function mapAuthMessage(): string {
  const origin = window.location.origin;
  if (origin.startsWith("http://127.0.0.1")) {
    return "네이버 지도는 http://127.0.0.1 을 인증하지 않습니다. http://localhost:3000 으로 열어 주세요.";
  }
  if (origin.endsWith(".vercel.app") && origin !== "https://pixel-claw-club.vercel.app") {
    return "이 Vercel 주소는 지도에 등록되어 있지 않습니다. https://pixel-claw-club.vercel.app 으로 열어 주세요.";
  }
  return "네이버 지도 인증에 실패했습니다. Dynamic Map 권한과 현재 주소의 웹 서비스 URL을 확인해 주세요.";
}

function loadNaver(clientId: string, onAuthFailure: () => void): Promise<void> {
  const host = window as NaverWindow;
  if (host.naver?.maps) {
    return Promise.resolve();
  }
  if (!naverLoader) {
    naverLoader = new Promise((resolve, reject) => {
      let settled = false;
      const succeed = () => {
        if (settled || !host.naver?.maps) {
          return;
        }
        settled = true;
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        naverLoader = null;
        reject(error);
      };
      host.navermap_authFailure = () => {
        onAuthFailure();
        fail(new Error("naver auth failed"));
      };
      appendMapScript(clientId).then(() => window.setTimeout(succeed, 300)).catch(fail);
      window.setTimeout(() => {
        if (settled) {
          return;
        }
        if (host.naver?.maps) {
          succeed();
          return;
        }
        onAuthFailure();
        fail(new Error("naver auth failed"));
      }, 2500);
    });
  }
  return naverLoader;
}

function naverClientId(map: PublicMapConfig): string {
  const fromEnv = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim() ?? "";
  if (fromEnv) {
    return fromEnv;
  }
  return map.provider === "naver" ? (map.clientId?.trim() ?? "") : "";
}

export function MapScreen({
  places,
  map,
  practice,
}: {
  places: MapPlaceView[];
  map: PublicMapConfig;
  practice: boolean;
}) {
  const clientId = naverClientId(map);
  const naverReady = clientId.length > 0;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [status, setStatus] = useState<string | null>(naverReady ? null : "네이버 지도 키가 없어 지도를 표시하지 않습니다.");
  const [mapReady, setMapReady] = useState(false);
  const [publicPlaces, setPublicPlaces] = useState<MapPlaceView[]>([]);
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const markersRef = useRef<NaverMarker[]>([]);

  const visible = useMemo(() => {
    const text = query.trim();
    return places.filter((place) => {
      const matchesText = text.length === 0 || place.name.includes(text) || place.address.includes(text);
      if (!matchesText) {
        return false;
      }
      if (filter === "visited") {
        return place.visited;
      }
      if (filter === "revenge") {
        return place.revenge;
      }
      if (filter === "nearby") {
        if (!location || place.latitude === null || place.longitude === null) {
          return false;
        }
        return haversineMeters(location.latitude, location.longitude, place.latitude, place.longitude) <= NEARBY_METERS;
      }
      return true;
    });
  }, [filter, location, places, query]);

  const marked = useMemo(() => {
    const club = visible.filter((place) => place.latitude !== null && place.longitude !== null);
    if (filter === "visited" || filter === "revenge") {
      return club;
    }
    const ids = new Set(club.map((place) => place.id));
    return [...club, ...publicPlaces.filter((place) => !ids.has(place.id) && place.latitude !== null && place.longitude !== null)];
  }, [filter, publicPlaces, visible]);

  const selected = [...places, ...publicPlaces].find((place) => place.id === selectedId && (place.clusterCount ?? 1) === 1) ?? null;

  useEffect(() => {
    if (!naverReady || !mapNode.current) {
      return;
    }
    const node = mapNode.current;
    let cancelled = false;
    const failAuth = () => {
      if (!cancelled) {
        setMapReady(false);
        setStatus(mapAuthMessage());
      }
    };
    loadNaver(clientId, failAuth)
      .then(() => {
        if (cancelled || mapRef.current) {
          return;
        }
        const naver = (window as NaverWindow).naver;
        if (!naver) {
          setStatus("네이버 지도 스크립트를 불러오지 못했습니다.");
          return;
        }
        const center = firstCoordinate(places) ?? { latitude: 37.5665, longitude: 126.978 };
        const created = new naver.maps.Map(node, {
          center: new naver.maps.LatLng(center.latitude, center.longitude),
          zoom: 14,
        });
        mapRef.current = created;
        const fitMap = () => {
          node.style.width = "100%";
          node.style.height = "100%";
          naver.maps.Event.trigger(created, "resize");
        };
        window.requestAnimationFrame(fitMap);
        window.setTimeout(() => {
          if (cancelled) {
            return;
          }
          fitMap();
          if (node.style.backgroundImage.includes("auth_fail")) {
            setMapReady(false);
            setStatus(mapAuthMessage());
            return;
          }
          setMapReady(true);
          setStatus(null);
        }, 400);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("네이버 지도 스크립트를 불러오지 못했습니다. Dynamic Map 권한과 웹 서비스 URL을 확인해 주세요.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, naverReady, places]);

  useEffect(() => {
    const node = mapNode.current;
    if (!node || !mapReady) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const naver = (window as NaverWindow).naver;
      if (naver && mapRef.current) {
        node.style.width = "100%";
        node.style.height = "100%";
        naver.maps.Event.trigger(mapRef.current, "resize");
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || practice) {
      return;
    }
    const naver = (window as NaverWindow).naver;
    const naverMap = mapRef.current;
    if (!naver || !naverMap) {
      return;
    }
    let timer = 0;
    let ignore = false;
    const load = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        if (filter === "visited" || filter === "revenge") {
          setPublicPlaces([]);
          return;
        }
        const text = query.trim();
        const params = new URLSearchParams();
        if (text.length >= 2) {
          params.set("q", text);
        } else {
          const bounds = naverMap.getBounds();
          const southWest = bounds.getSW();
          const northEast = bounds.getNE();
          params.set("south", String(southWest.lat()));
          params.set("west", String(southWest.lng()));
          params.set("north", String(northEast.lat()));
          params.set("east", String(northEast.lng()));
          params.set("zoom", String(naverMap.getZoom()));
          if (filter === "nearby" && location) {
            params.set("nearLat", String(location.latitude));
            params.set("nearLng", String(location.longitude));
          }
        }
        const response = await fetch(`/api/map/stores?${params.toString()}`);
        if (!response.ok || ignore) {
          return;
        }
        const body = (await response.json()) as { places?: MapPlaceView[] };
        if (!ignore) {
          setPublicPlaces(body.places ?? []);
        }
      }, 280);
    };
    load();
    const listener = naver.maps.Event.addListener(naverMap, "idle", load);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
      naver.maps.Event.removeListener(listener);
    };
  }, [filter, location, mapReady, practice, query]);

  useEffect(() => {
    const naverMap = mapRef.current;
    const naver = (window as NaverWindow).naver;
    if (!mapReady || !naverMap || !naver) {
      return;
    }
    for (const marker of markersRef.current) {
      marker.setMap(null);
    }
    markersRef.current = marked.map((place) => {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(place.latitude ?? 0, place.longitude ?? 0),
          map: naverMap,
          title: place.name,
          icon: {
            content: markerHtml(place, place.id === selectedId),
            anchor: new naver.maps.Point(18, 42),
          },
        });
        naver.maps.Event.addListener(marker, "click", () => {
          if ((place.clusterCount ?? 1) > 1) {
            naverMap.setCenter(new naver.maps.LatLng(place.latitude ?? 0, place.longitude ?? 0));
            naverMap.setZoom(Math.min(naverMap.getZoom() + 2, 18), true);
            return;
          }
          setSelectedId(place.id);
        });
        return marker;
      });
  }, [mapReady, marked, selectedId]);

  function changeZoom(delta: number) {
    const current = mapRef.current;
    if (!current) {
      return;
    }
    current.setZoom(current.getZoom() + delta);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setStatus("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setLocation(next);
        setFilter("nearby");
        const naver = (window as NaverWindow).naver;
        if (naver && mapRef.current) {
          mapRef.current.panTo(new naver.maps.LatLng(next.latitude, next.longitude));
        }
        setStatus("현재 위치 3km 안의 매장을 표시합니다. 위치는 계속 추적하지 않습니다.");
      },
      () => setStatus("위치 권한을 허용하지 않았거나 시간을 초과했습니다."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  }

  function chooseFilter(next: FilterId) {
    setFilter(next);
    if (next === "nearby" && !location) {
      requestLocation();
    }
  }

  function focusPlace(place: MapPlaceView) {
    setSelectedId(place.id);
    const naver = (window as NaverWindow).naver;
    if (naver && mapRef.current && place.latitude !== null && place.longitude !== null) {
      mapRef.current.panTo(new naver.maps.LatLng(place.latitude, place.longitude));
    }
  }

  return (
    <section className="relative mx-auto flex h-full min-h-0 w-full max-w-[430px] flex-1 flex-col overflow-hidden bg-[#fff7fb]">
      <header className="rounded-b-[28px] bg-[#ffe3ee] px-4 pb-3 pt-3 shadow-sm">
        <div className="flex items-center gap-3">
          <PixelLogo />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold tracking-wide text-[#ff6f93]">PIXEL CLAW CLUB</p>
            <p className="text-xs text-[#8d6674]">우리들의 뽑기 원정대</p>
          </div>
          <button type="button" aria-label="알림" onClick={() => setNoticeOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#ff6f93]">
            <BellIcon />
          </button>
          <button type="button" aria-label="메뉴" onClick={() => setMenuOpen((open) => !open)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#ff6f93]">
            <MenuIcon />
          </button>
        </div>
        {noticeOpen ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm text-[#8d6674]">아직 알림이 없습니다.</p> : null}
        {menuOpen ? (
          <div className="mt-2 grid gap-2 rounded-2xl bg-white p-2 text-sm">
            <Link href="/stores/new" className="rounded-xl px-3 py-2">매장 등록</Link>
            <Link href="/settings" className="rounded-xl px-3 py-2">설정</Link>
          </div>
        ) : null}
        <form
          className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 shadow-sm"
          onSubmit={(event) => event.preventDefault()}
        >
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="매장명 또는 지역 검색"
            className="min-h-12 flex-1 bg-transparent text-sm outline-none"
          />
          {query ? (
            <button type="button" aria-label="검색어 삭제" onClick={() => setQuery("")} className="grid h-8 w-8 place-items-center rounded-full text-[#b7b0b6]">
              ×
            </button>
          ) : null}
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseFilter(item.id)}
              className={`min-h-10 shrink-0 rounded-full px-3 text-sm ${filter === item.id ? "bg-[#ff7ea4] text-white" : "bg-white text-[#8d6674]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {naverReady ? <div ref={mapNode} className="absolute inset-0 h-full w-full" /> : (
          <div className="absolute inset-0 grid place-items-center bg-[#fff1f6] px-6 text-center text-sm leading-6 text-[#8d6674]">
            <p>
              네이버 지도 키가 없습니다. `NEXT_PUBLIC_MAP_PROVIDER=naver`와 `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`를 설정해 주세요.
              네이버 클라우드에서 Dynamic Map을 허용하고, 이 사이트 주소를 웹 서비스 URL에 추가해야 합니다.
            </p>
          </div>
        )}
        {naverReady ? (
          <div className="absolute bottom-16 right-4 z-10 grid justify-items-end gap-1.5">
            <button type="button" aria-label="확대" onClick={() => changeZoom(1)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-base shadow">+</button>
            <button type="button" aria-label="축소" onClick={() => changeZoom(-1)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-base shadow">−</button>
            <button type="button" onClick={requestLocation} className="min-h-10 rounded-full bg-white px-3 text-xs shadow">내 위치</button>
          </div>
        ) : null}
        {naverReady && status ? <p className="absolute left-3 right-3 top-3 z-10 rounded-2xl bg-white/95 px-3 py-2 text-xs leading-5 text-[#8d6674]">{status}</p> : null}
        <ul className="absolute left-3 right-16 top-14 z-10 flex gap-2 overflow-x-auto">
          {visible.filter((place) => place.latitude === null).map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => focusPlace(place)} className="rounded-full bg-white px-3 py-2 text-xs shadow">
                {place.name} · 좌표 없음
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <article className="absolute inset-x-3 bottom-3 z-20 rounded-3xl bg-white p-3 shadow-lg">
            <div className="flex gap-3">
              <StorePlaceholder />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold">{selected.name}</h2>
                  <button type="button" aria-label="카드 닫기" onClick={() => setSelectedId(null)} className="text-[#b7b0b6]">×</button>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#8d6674]">{selected.address || "주소 없음"}</p>
                <p className="mt-1 text-xs text-[#ff6f93]">
                  방문 {selected.visitCount}회 · 성공 {selected.winCount} · 실패 {selected.failCount}
                  {selected.revenge ? " · 복수 대상" : ""}
                </p>
                <p className="text-xs text-[#8d6674]">{selected.spendingLabel}</p>
                {practice ? <p className="text-[11px] text-[#b07a38]">연습 데이터입니다. 실제 매장 목록이 아닙니다.</p> : null}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href={selected.origin === "public" ? `/stores/public/${selected.id}` : `/stores/${selected.id}`} className="grid min-h-11 place-items-center rounded-full border border-[#ffb3c8] text-sm text-[#ff6f93]">상세보기</Link>
              {selected.origin === "public" ? (
                <Link href={`/stores/public/${selected.id}`} className="grid min-h-11 place-items-center rounded-full bg-[#ff7ea4] text-sm text-white">기록·복수 연결</Link>
              ) : (
                <Link href={`/records/new?store=${selected.id}`} className="grid min-h-11 place-items-center rounded-full bg-[#ff7ea4] text-sm text-white">이 매장에 기록 추가</Link>
              )}
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function firstCoordinate(places: MapPlaceView[]): { latitude: number; longitude: number } | null {
  const place = places.find((item) => item.latitude !== null && item.longitude !== null);
  if (!place || place.latitude === null || place.longitude === null) {
    return null;
  }
  return { latitude: place.latitude, longitude: place.longitude };
}

function markerHtml(place: MapPlaceView, selectedPlace: boolean): string {
  if ((place.clusterCount ?? 1) > 1) {
    return `<div style="min-width:36px;height:36px;padding:0 8px;border-radius:999px;background:#ff7ea4;color:white;display:grid;place-items:center;font-size:12px;font-weight:700;border:3px solid white;box-shadow:0 4px 0 rgba(44,40,37,.12)">${place.clusterCount}</div>`;
  }
  const scale = selectedPlace ? 1.25 : 1;
  const kind = place.revenge ? heart() : place.visited ? character() : pin();
  return `<div style="transform:scale(${scale});transform-origin:center bottom">${kind}</div>`;
}

function pin(): string {
  return `<div style="width:28px;height:28px;border-radius:999px;background:#ff7ea4;border:3px solid white;box-shadow:0 4px 0 rgba(44,40,37,.12)"></div>`;
}

function heart(): string {
  return `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="12" fill="#ff5f8f" stroke="white" stroke-width="3"/><path d="M17 24s-7-4.2-7-8a3.5 3.5 0 0 1 6-2 3.5 3.5 0 0 1 6 2c0 3.8-5 8-5 8z" fill="white"/></svg>`;
}

function character(): string {
  return `<div style="width:36px;height:42px"><div style="width:22px;height:16px;margin:0 auto;background:#ffd7e4;border:2px solid #2c2825"></div><div style="width:26px;height:18px;margin:-2px auto 0;background:#7eb6ff;border:2px solid #2c2825"></div></div>`;
}

function PixelLogo() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true">
      <rect x="8" y="6" width="26" height="22" rx="8" fill="#ffd7e4" stroke="#2c2825" strokeWidth="2" />
      <rect x="14" y="14" width="4" height="4" fill="#2c2825" />
      <rect x="24" y="14" width="4" height="4" fill="#2c2825" />
      <rect x="16" y="22" width="10" height="3" fill="#ff6f93" />
    </svg>
  );
}

function StorePlaceholder() {
  return (
    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#ffe3ee] text-[10px] leading-3 text-[#ff6f93]">
      사진
      <br />
      없음
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b7b0b6" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2H4.5L6 16Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" />
    </svg>
  );
}
