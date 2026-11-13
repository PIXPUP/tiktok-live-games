"""Original 120 BPM cha-cha instrumental, rendered once for low runtime CPU.
No recording or melody from another song is used. Four-beat bars with a
4-and-1 cha-cha-cha percussion accent, bass, offbeat chords and new melody.
"""
import array
import math
import random
import wave
from pathlib import Path

BPM=120
BARS=16
RATE=22050


def render_ramwong(path):
    beat=60/BPM
    count=round(BARS*4*beat*RATE)
    samples=[0.0]*count
    rng=random.Random(521)
    chords=[(48,52,55),(45,48,52),(53,57,60),(43,47,50)]
    melodies=[(72,76,79,76,74,72,67,69),(69,72,76,79,76,72,69,67),
              (77,81,84,81,79,77,76,72),(74,79,83,79,77,74,71,67)]
    def note(midi,at,duration,gain,bright=False):
        freq=440*2**((midi-69)/12)
        start=round(at*RATE);length=round(duration*RATE)
        for j in range(length):
            t=j/RATE;phase=2*math.pi*freq*t
            value=(math.sin(phase)+(.25*math.sin(2*phase) if bright else 0))
            envelope=min(1,t/.008)*math.exp(-t/(.12 if bright else .20))
            samples[(start+j)%count]+=value*envelope*gain
    def drum(at,kind):
        duration={'kick':.15,'rim':.065,'shaker':.035,'conga':.11}[kind]
        start=round(at*RATE)
        for j in range(round(duration*RATE)):
            t=j/RATE
            if kind=='kick':value=math.sin(2*math.pi*(52*t+2*(1-math.exp(-25*t))))*math.exp(-t*25)*.23
            elif kind=='rim':value=(rng.uniform(-1,1)*.65+math.sin(2*math.pi*1750*t)*.35)*math.exp(-t*80)*.11
            elif kind=='shaker':value=rng.uniform(-1,1)*math.exp(-t*110)*.045
            else:value=(math.sin(2*math.pi*210*t)+.25*math.sin(2*math.pi*390*t))*math.exp(-t*35)*.12
            samples[(start+j)%count]+=value
    for bar in range(BARS):
        start=bar*4*beat;chord=chords[bar%4]
        for position in (0,2):drum(start+position*beat,'kick')
        for position in (1,3):drum(start+position*beat,'rim')
        for step in range(8):drum(start+step*.5*beat,'shaker')
        for position in (0,1.5,3,3.5):drum(start+position*beat,'conga')
        for position in (0,1.5,2,3.5):note(chord[0]-12,start+position*beat,.21,.13)
        for position in (.5,1.5,2.5,3,3.5):
            for pitch in chord:note(pitch+12,start+position*beat,.17,.035,True)
        for step,pitch in enumerate(melodies[(bar//2)%4]):
            if (bar+step)%5!=0:note(pitch,start+step*.5*beat,.23,.115,True)
    peak=max(abs(x) for x in samples) or 1
    gain=min(1,.78/peak)
    pcm=array.array('h')
    for i,value in enumerate(samples):
        # Tiny seam fades avoid a click without an audible pause between loops.
        fade=min(1,i/(RATE*.006),(count-1-i)/(RATE*.012))
        pcm.append(round(value*gain*fade*32767))
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    with wave.open(str(path),'wb') as out:
        out.setparams((1,2,RATE,count,'NONE','not compressed'));out.writeframes(pcm.tobytes())


if __name__=='__main__':
    import sys
    render_ramwong(sys.argv[1])
