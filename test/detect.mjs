// Mac detection reads chip, memory and GPU cores from ONE system_profiler call
// (SPHardwareDataType + SPDisplaysDataType), and the display part is optional.
// Run: node test/detect.mjs   (or npm test)

import { appleGpuCores, gpuSlug, parseMacProfiler, parseNvidiaSmi } from '../src/detect.mjs';

let failures = 0;
const check = (ok, msg) => { if (!ok) { console.error(`✗ ${msg}`); failures++; } };

// Shape of `system_profiler SPHardwareDataType SPDisplaysDataType -json` on an Apple silicon Mac
// (identifying fields such as the serial number left out).
const combined = JSON.stringify({
  SPHardwareDataType: [{ machine_name: 'MacBook Pro', chip_type: 'Apple M5 Max', physical_memory: '128 GB', number_processors: 'proc 18:6:12' }],
  SPDisplaysDataType: [{ sppci_model: 'Apple M5 Max', sppci_cores: '40', sppci_device_type: 'spdisplays_gpu' }],
});
const p = parseMacProfiler(combined);
check(p.machineName === 'MacBook Pro', 'machine name from the combined document');
check(p.chipRaw === 'Apple M5 Max', 'chip from the combined document');
check(p.memGb === 128, 'memory from the combined document');
check(p.cpuCores === 18, 'CPU cores from the combined document');
check(appleGpuCores(p.displays) === 40, 'GPU cores from the combined document');

// Hardware only (the display query skipped for a --chip or --gpu-cores override).
const hwOnly = parseMacProfiler(JSON.stringify({ SPHardwareDataType: JSON.parse(combined).SPHardwareDataType }));
check(hwOnly.chipRaw === 'Apple M5 Max' && hwOnly.displays === null, 'hardware-only document');
check(appleGpuCores(hwOnly.displays) === null, 'no display data gives no GPU core count');

// An external display listed first does not hide the Apple GPU; junk gives nothing.
check(appleGpuCores([{ sppci_model: 'DELL U2723QE' }, { sppci_model: 'Apple M4', sppci_cores: '10' }]) === 10, 'Apple GPU found after another display');
check(appleGpuCores([{ sppci_model: 'Apple M4', sppci_cores: 'n/a' }]) === null, 'unparseable core count');
check(parseMacProfiler('not json').chipRaw === '' && parseMacProfiler('').memGb === 0, 'bad or empty output falls back');

// nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits (MiB). The 10GB and 12GB
// desktop RTX 3080 share one name: memory picks the card page, and only the 10GB card has one.
const smi = (line) => parseNvidiaSmi(line)?.slug;
check(smi('NVIDIA GeForce RTX 3080, 10240') === 'rtx-3080-10gb', 'RTX 3080 10GB from nvidia-smi');
check(smi('NVIDIA GeForce RTX 3080, 10240\nNVIDIA GeForce RTX 3080, 10240') === 'rtx-3080-10gb', 'two RTX 3080 10GB');
check(smi('NVIDIA GeForce RTX 3080, 12288') === '', 'RTX 3080 12GB has no card page');
check(smi('NVIDIA GeForce RTX 3080 Laptop GPU, 16384') === '' && smi('NVIDIA GeForce RTX 3080 Laptop GPU, 8192') === '', 'laptop RTX 3080 is not the desktop card');
check(gpuSlug('NVIDIA GeForce RTX 3080 10GB') === 'rtx-3080-10gb' && gpuSlug('NVIDIA GeForce RTX 3080 12GB', 12) === '', 'RTX 3080 size in the name');
check(smi('NVIDIA GeForce RTX 3080 Ti, 12288') === 'rtx-3080-ti', 'RTX 3080 Ti unchanged');
check(smi('NVIDIA GeForce RTX 3060, 12288') === 'rtx-3060' && smi('NVIDIA GeForce RTX 4090, 24564') === 'rtx-4090', 'other cards unchanged');

if (failures) { console.error(`\n${failures} detect check(s) failed.`); process.exit(1); }
console.log('✓ detect reads chip, memory and GPU cores from one system_profiler call, and names the RTX 3080 10GB card');
