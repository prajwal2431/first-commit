import { RetailRecord } from '../../models/RetailRecord';
import { OrderRecord } from '../../models/OrderRecord';
import { WeatherRecord } from '../../models/WeatherRecord';
import { LiveSignal } from '../../models/DashboardState';
import festivalCalendar from '../../data/festival_calendar.json';
import crypto from 'crypto';

export interface DemandSpikesResult {
  signals: LiveSignal[];
}

interface FestivalEntry {
  date: string;
  name: string;
  region: string;
  intensity: number;
}

function isFestivalWeek(dateStr: string): FestivalEntry | null {
  const d = new Date(dateStr).getTime();
  for (const f of festivalCalendar as FestivalEntry[]) {
    const fDate = new Date(f.date).getTime();
    if (Math.abs(d - fDate) <= 7 * 86400000) {
      return f;
    }
  }
  return null;
}

export async function computeDemandSpikes(organizationId: string): Promise<DemandSpikesResult> {
  const signals: LiveSignal[] = [];

  const retailData = await RetailRecord.find({ organizationId })
    .sort({ date: 1 })
    .lean();

  const orderData = await OrderRecord.find({ organizationId })
    .sort({ date: 1 })
    .lean();

  if (retailData.length === 0 && orderData.length === 0) {
    return { signals };
  }

  const dailyUnits = new Map<string, number>();
  const dailyRevenue = new Map<string, number>();
  const skuDailyUnits = new Map<string, Map<string, number>>();

  for (const r of retailData) {
    const key = new Date(r.date).toISOString().slice(0, 10);
    dailyUnits.set(key, (dailyUnits.get(key) ?? 0) + r.units);
    dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + r.revenue);

    if (!skuDailyUnits.has(r.sku)) skuDailyUnits.set(r.sku, new Map());
    const skuMap = skuDailyUnits.get(r.sku)!;
    skuMap.set(key, (skuMap.get(key) ?? 0) + r.units);
  }

  for (const o of orderData) {
    const key = new Date(o.date).toISOString().slice(0, 10);
    dailyUnits.set(key, (dailyUnits.get(key) ?? 0) + o.quantity);
    dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + o.revenue);

    if (!skuDailyUnits.has(o.sku)) skuDailyUnits.set(o.sku, new Map());
    const skuMap = skuDailyUnits.get(o.sku)!;
    skuMap.set(key, (skuMap.get(key) ?? 0) + o.quantity);
  }

  const sortedDays = Array.from(dailyUnits.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  if (sortedDays.length < 7) return { signals };

  const values = sortedDays.map(([, v]) => v);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  const threshold = mean + 2 * stddev;

  const weatherData = await WeatherRecord.find({ organizationId }).lean();
  const weatherByDate = new Map<string, any[]>();
  for (const w of weatherData) {
    const key = new Date(w.date).toISOString().slice(0, 10);
    if (!weatherByDate.has(key)) weatherByDate.set(key, []);
    weatherByDate.get(key)!.push(w);
  }

  for (const [date, units] of sortedDays.slice(-14)) {
    if (units <= threshold) continue;

    const spikePercent = mean > 0 ? ((units - mean) / mean) * 100 : 0;
    let classification = 'organic';
    let context = '';

    const festival = isFestivalWeek(date);
    if (festival && festival.intensity >= 3) {
      classification = 'festival-driven';
      context = `Near ${festival.name} (intensity ${festival.intensity}/5)`;
    }

    const dayWeather = weatherByDate.get(date);
    if (dayWeather && dayWeather.length > 0) {
      const avgTemp = dayWeather.reduce((s, w) => s + w.temp_max, 0) / dayWeather.length;
      const prevWeek = Array.from(weatherByDate.entries())
        .filter(([d]) => d < date && d >= new Date(new Date(date).getTime() - 7 * 86400000).toISOString().slice(0, 10))
        .flatMap(([, ws]) => ws);
      const prevAvgTemp = prevWeek.length > 0
        ? prevWeek.reduce((s, w) => s + w.temp_max, 0) / prevWeek.length
        : avgTemp;

      if (Math.abs(avgTemp - prevAvgTemp) > 5) {
        classification = classification === 'festival-driven' ? 'festival-driven' : 'weather-driven';
        context += ` Temperature shift: ${prevAvgTemp.toFixed(0)}°C → ${avgTemp.toFixed(0)}°C`;
      }

      const totalRain = dayWeather.reduce((s, w) => s + w.rainfall_mm, 0);
      if (totalRain > 20) {
        if (classification === 'organic') classification = 'weather-driven';
        context += ` Heavy rainfall: ${totalRain.toFixed(0)}mm`;
      }
    }

    signals.push({
      id: crypto.randomUUID(),
      severity: spikePercent > 100 ? 'critical' : spikePercent > 50 ? 'high' : 'medium',
      monitorType: 'demand',
      title: `Demand spike: +${spikePercent.toFixed(0)}% on ${date}`,
      description: `${units} units vs ${mean.toFixed(0)} avg. Classification: ${classification}${context ? '. ' + context : ''}`,
      suggestedQuery: `What is driving the demand spike on ${date}?`,
      evidenceSnippet: `Units: ${units} (avg: ${mean.toFixed(0)}, threshold: ${threshold.toFixed(0)}). Type: ${classification}`,
      detectedAt: new Date(),
    });
  }

  for (const [sku, dailyMap] of skuDailyUnits) {
    const skuValues = Array.from(dailyMap.values());
    if (skuValues.length < 5) continue;
    const skuMean = skuValues.reduce((s, v) => s + v, 0) / skuValues.length;
    const skuStd = Math.sqrt(skuValues.reduce((s, v) => s + (v - skuMean) ** 2, 0) / skuValues.length);
    const skuThreshold = skuMean + 2.5 * skuStd;

    const lastDay = Array.from(dailyMap.entries()).sort(([a], [b]) => b.localeCompare(a))[0];
    if (lastDay && lastDay[1] > skuThreshold && lastDay[1] > skuMean * 2) {
      signals.push({
        id: crypto.randomUUID(),
        severity: 'high',
        monitorType: 'demand',
        title: `SKU demand spike: ${sku}`,
        description: `${lastDay[1]} units on ${lastDay[0]} vs avg ${skuMean.toFixed(0)}`,
        suggestedQuery: `Why is demand spiking for ${sku}?`,
        evidenceSnippet: `SKU ${sku}: ${lastDay[1]} units (avg: ${skuMean.toFixed(0)})`,
        detectedAt: new Date(),
      });
    }
  }

  return { signals };
}
