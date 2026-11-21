import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientActionMessage, RoomSyncPayload, ServerMessage } from '../shared/types';
import { playBellSound } from '../utils/sound';

function getOrCreateToken(): string {
  try {
    const existing = localStorage.getItem('ndm_player_token');
    if (existing) return existing;
    const created = `tok_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
    localStorage.setItem('ndm_player_token', created);
    return created;
  } catch {
    return `tok_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function useGameSocket() {
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomSyncPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string>(getOrCreateToken());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRoomRef = useRef<{ roomCode: string; name: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ndm_last_session');
      if (saved) {
        const parsed = JSON.parse(saved) as { roomCode: string; name: string };
        if (parsed.roomCode && parsed.name) {
          lastRoomRef.current = parsed;
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setErrorMsg(null);
      if (lastRoomRef.current) {
        ws.send(
          JSON.stringify({
            type: 'JOIN_ROOM',
            roomCode: lastRoomRef.current.roomCode,
            name: lastRoomRef.current.name,
            playerToken: tokenRef.current,
          } satisfies ClientActionMessage)
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === 'SYNC') {
          setRoomState(msg.payload);
          const me = msg.payload.publicState.players.find(
            (p) => p.id === msg.payload.privateState.playerId
          );
          if (me) {
            const session = {
              roomCode: msg.payload.publicState.roomCode,
              name: me.name,
            };
            lastRoomRef.current = session;
            try {
              localStorage.setItem('ndm_last_session', JSON.stringify(session));
            } catch {
              // ignore
            }
          }
        } else if (msg.type === 'ERROR') {
          setErrorMsg(msg.message);
          setTimeout(() => setErrorMsg((cur) => (cur === msg.message ? null : cur)), 4000);
        } else if (msg.type === 'TOAST') {
          setToastMsg(msg.message);
          setTimeout(() => setToastMsg((cur) => (cur === msg.message ? null : cur)), 4000);
        } else if (msg.type === 'BELL_SOUND') {
          playBellSound(msg.reason);
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, 1500);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendAction = useCallback((action: ClientActionMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setErrorMsg('Reconectando ao servidor...');
      return;
    }
    if (action.type === 'CREATE_ROOM' || action.type === 'JOIN_ROOM') {
      ws.send(JSON.stringify({ ...action, playerToken: tokenRef.current }));
    } else {
      ws.send(JSON.stringify(action));
    }
  }, []);

  const leaveSession = useCallback(() => {
    lastRoomRef.current = null;
    try {
      localStorage.removeItem('ndm_last_session');
    } catch {
      // ignore
    }
    setRoomState(null);
    wsRef.current?.close();
  }, []);

  return {
    connected,
    roomState,
    errorMsg,
    toastMsg,
    clearError: () => setErrorMsg(null),
    sendAction,
    leaveSession,
  };
}
