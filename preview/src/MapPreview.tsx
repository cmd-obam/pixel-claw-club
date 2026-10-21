import { useEffect, useMemo, useRef, useState } from "react";
import { haversineMeters } from "@/domain/stores";
import { sampleStores, type SampleStore } from "./sample";

const NEARBY_METERS = 3000;
const MISSING_KEY = "네이버 지도 키가 없습니다. GitHub Actions Variable VITE_NAVER_MAP_CLIENT_ID를 설정해 주세요. 코드에는 키를 넣지 않습니다.";
const AUTH_FAILED = "네이버 지도 인증에 실패했습니다. Dynamic Map 권한과 웹 서비스 URL에 https://cmd-obam.github.io 가 포함됐는지 확인해 주세요.";
const SCRIPT_FAILED = "네이버 지도 스크립트를 불러오지 못했습니다. 네트워크와 Dynamic Map 권한을 확인해 주세요.";

type FilterId = "all" | "nearby" | "visited" | "revenge";
type NaverMap = {
  panTo: (position: object) => void;
  setZoom: (zoom: number, smooth?: boolean) => void;
  getZoom: () => number;
};
type NaverMarker = { setMap: (map: NaverMap | null) => void };
type NaverNamespace = {
  maps: {
    Map: new (node: HTMLElement, options: object) => NaverMap;
    LatLng: new (latitude: number, longitude: number) => object;
    Point: new (x: number, y: number) => object;
    Marker: new (options: object) => NaverMarker;
    Event: {
      addListener: (target: object, event: string, handler: () => void) => void;
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

function mapClientId(): string {
  return import.meta.env.VITE_NAVER_MAP_CLIENT_ID?.trim() ?? "";
}

function loadNaver(clientId: string): Promise<void> {
  const host = window as NaverWindow;
  if (host.naver?.maps) {
    return Promise.resolve();
  }
  if (!naverLoader) {
    naverLoader = new Promise((resolve, reject) => {
      let settled = false;
      const fail = () => {
        if (settled) {
          return;
        }
        settled = true;
        naverLoader = null;
        reject(new Error("naver auth failed"));
      };
      host.navermap_authFailure = fail;
      const script = document.createElement("script");
      script.async = true;
      script.dataset.naverMap = "ncpKeyId";
      script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
      script.onload = () => {
        window.setTimeout(() => {
          if (settled) {
            return;
          }
          if (host.naver?.maps) {
            settled = true;
            resolve();
            return;
          }
          fail();
        }, 600);
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return naverLoader;
}

export function MapPreview() {
  const clientId = mapClientId();
  const naverReady = clientId.length > 0;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [cardNote, setCardNote] = useState<string | null>(null);
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<NaverMap | null>(null);
  const markersRef = useRef<NaverMarker[]>([]);

  const visible = useMemo(() => {
    const text = query.trim();
    return sampleStores.filter((place) => {
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
  }, [filter, location, query]);

  const selected = visible.find((place) => place.id === selectedId) ?? null;

  useEffect(() => {
    if (!naverReady || !mapNode.current) {
      return;
    }
    const node = mapNode.current;
    let cancelled = false;
    loadNaver(clientId)
      .then(() => {
        if (cancelled || mapRef.current) {
          return;
        }
        const naver = (window as NaverWindow).naver;
        if (!naver?.maps) {
          setStatus(SCRIPT_FAILED);
          return;
        }
        const center = sampleStores.find((place) => place.latitude !== null && place.longitude !== null);
        const created = new naver.maps.Map(node, {
          center: new naver.maps.LatLng(center?.latitude ?? 37.5665, center?.longitude ?? 126.978),
          zoom: 12,
        });
        mapRef.current = created;
        window.setTimeout(() => {
          if (cancelled) {
            return;
          }
          node.style.height = "100%";
          node.style.minHeight = "480px";
          naver.maps.Event.trigger(created, "resize");
          if (node.style.backgroundImage.includes("auth_fail")) {
            setMapReady(false);
            setStatus(AUTH_FAILED);
            return;
          }
          setMapReady(true);
          setStatus(null);
        }, 500);
      })
      .catch(() => {
        if (!cancelled) {
          setMapReady(false);
          setStatus(AUTH_FAILED);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, naverReady]);

  useEffect(() => {
    const naverMap = mapRef.current;
    const naver = (window as NaverWindow).naver;
    if (!mapReady || !naverMap || !naver?.maps) {
      return;
    }
    for (const marker of markersRef.current) {
      marker.setMap(null);
    }
    markersRef.current = visible
      .filter((place) => place.latitude !== null && place.longitude !== null)
      .map((place) => {
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
          setSelectedId(place.id);
          setCardNote(null);
        });
        return marker;
      });
  }, [mapReady, selectedId, visible]);

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
        if (naver?.maps && mapRef.current) {
          mapRef.current.panTo(new naver.maps.LatLng(next.latitude, next.longitude));
        }
        setStatus("현재 위치 3km 안의 샘플 매장을 표시합니다. 위치는 계속 추적하지 않습니다.");
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

  function focusPlace(place: SampleStore) {
    setSelectedId(place.id);
    setCardNote(null);
    const naver = (window as NaverWindow).naver;
    if (naver?.maps && mapRef.current && place.latitude !== null && place.longitude !== null) {
      mapRef.current.panTo(new naver.maps.LatLng(place.latitude, place.longitude));
    }
  }

  return (
    <section className="relative mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-[430px] flex-col overflow-hidden bg-[#fff7fb]">
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
        {noticeOpen ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm text-[#8d6674]">알림은 샘플이며 로그인 계정으로 전달되지 않습니다.</p> : null}
        {menuOpen ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-sm text-[#8d6674]">매장 등록과 설정 저장은 정적 미리보기에서 지원하지 않습니다.</p> : null}
        <form className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 shadow-sm" onSubmit={(event) => event.preventDefault()}>
          <SearchIcon />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="매장명 또는 지역 검색"
            aria-label="매장명 또는 지역 검색"
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
      <div className="relative min-h-[480px] flex-1">
        {naverReady ? <div ref={mapNode} className="absolute inset-0 h-full min-h-[480px] w-full" /> : (
          <div className="absolute inset-0 grid place-items-center bg-[#fff1f6] px-6 text-center text-sm leading-6 text-[#8d6674]">
            <p>{MISSING_KEY}</p>
          </div>
        )}
        {naverReady ? (
          <div className="absolute bottom-28 right-3 z-10 grid gap-2">
            <button type="button" aria-label="확대" onClick={() => changeZoom(1)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg shadow">+</button>
            <button type="button" aria-label="축소" onClick={() => changeZoom(-1)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg shadow">−</button>
            <button type="button" onClick={requestLocation} className="min-h-11 rounded-full bg-white px-3 text-xs shadow">내 위치</button>
          </div>
        ) : null}
        {status ? <p className="absolute left-3 right-3 top-3 z-10 rounded-2xl bg-white/95 px-3 py-2 text-xs leading-5 text-[#8d6674]">{status}</p> : null}
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
          <article className="absolute inset-x-3 bottom-24 z-20 rounded-3xl bg-white p-3 shadow-lg">
            <div className="flex gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-[#ffe3ee] text-[10px] leading-3 text-[#ff6f93]">
                샘플
                <br />
                사진
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold">{selected.name}</h2>
                  <button type="button" aria-label="카드 닫기" onClick={() => setSelectedId(null)} className="text-[#b7b0b6]">×</button>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#8d6674]">{selected.address}</p>
                <p className="mt-1 text-xs text-[#ff6f93]">
                  방문 {selected.visitCount}회 · 성공 {selected.winCount} · 실패 {selected.failCount}
                  {selected.revenge ? " · 복수 대상" : ""}
                </p>
                <p className="text-xs text-[#8d6674]">{selected.spendingLabel}</p>
                <p className="text-[11px] text-[#b07a38]">샘플 매장입니다. 실제 기록이나 로그인 계정과 연결되지 않습니다.</p>
              </div>
            </div>
            {cardNote ? <p className="mt-3 rounded-2xl bg-[#fff1f6] px-3 py-2 text-xs leading-5 text-[#8d6674]">{cardNote}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setCardNote("상세 화면은 서버 앱의 기능입니다. 정적 미리보기에서는 이 샘플 카드만 보여 줍니다.")} className="grid min-h-11 place-items-center rounded-full border border-[#ffb3c8] text-sm text-[#ff6f93]">상세보기</button>
              <button type="button" onClick={() => setCardNote("기록 저장은 지원하지 않습니다. 입력한 내용은 서버로 전송되지 않습니다.")} className="grid min-h-11 place-items-center rounded-full bg-[#ff7ea4] text-sm text-white">이 매장에 기록 추가</button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function markerHtml(place: SampleStore, selectedPlace: boolean): string {
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
