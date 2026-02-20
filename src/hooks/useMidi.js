import { useEffect, useRef } from 'react';
import { useStore } from '../store/index.js';

/**
 * Manages Web MIDI API connection and note events.
 *
 * @param {(note: number) => void} onNoteOn  Called on every MIDI note-on event.
 */
export function useMidi(onNoteOn) {
  // Keep onNoteOn in a ref so the MIDI message handler never becomes stale
  const onNoteOnRef = useRef(onNoteOn);
  useEffect(() => { onNoteOnRef.current = onNoteOn; });

  const setMidiAccess   = useStore(s => s.setMidiAccess);
  const setMidiInputs   = useStore(s => s.setMidiInputs);
  const setSelectedInput = useStore(s => s.setSelectedInput);
  const setMidiStatus   = useStore(s => s.setMidiStatus);
  const addPressedKey   = useStore(s => s.addPressedKey);
  const removePressedKey = useStore(s => s.removePressedKey);
  const updateDetectedRange = useStore(s => s.updateDetectedRange);
  const midiAccess      = useStore(s => s.midiAccess);
  const selectedInput   = useStore(s => s.selectedInput);

  // Request MIDI access once on mount
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiStatus('unavailable');
      return;
    }

    setMidiStatus('searching');
    navigator.requestMIDIAccess({ sysex: false })
      .then(access => {
        setMidiAccess(access);
        const inputs = Array.from(access.inputs.values());
        setMidiInputs(inputs);
        if (inputs.length > 0) {
          setSelectedInput(inputs[0].id);
          setMidiStatus('connected');
        } else {
          setMidiStatus('disconnected');
        }

        access.onstatechange = () => {
          const newInputs = Array.from(access.inputs.values());
          setMidiInputs(newInputs);
          setMidiStatus(newInputs.length > 0 ? 'connected' : 'disconnected');
          if (newInputs.length > 0) {
            // Only auto-select if nothing is selected yet
            setSelectedInput(prev => prev || newInputs[0].id);
          }
        };
      })
      .catch(() => setMidiStatus('unavailable'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bind/rebind message handler whenever the selected input changes
  useEffect(() => {
    if (!midiAccess || !selectedInput) return;
    const input = midiAccess.inputs.get(selectedInput);
    if (!input) return;

    input.onmidimessage = (e) => {
      const [status, note, velocity] = e.data;
      const command = status & 0xf0;

      if (command === 0x90 && velocity > 0) {
        addPressedKey(note);
        updateDetectedRange(note);
        onNoteOnRef.current?.(note);
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        removePressedKey(note);
      }
    };

    return () => { input.onmidimessage = null; };
  }, [midiAccess, selectedInput, addPressedKey, removePressedKey, updateDetectedRange]);
}
