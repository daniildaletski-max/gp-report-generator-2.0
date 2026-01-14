declare module 'xlsx-chart' {
  interface ChartOptions {
    file?: string;
    chart: 'column' | 'bar' | 'line' | 'area' | 'radar' | 'scatter' | 'pie';
    titles: string[];
    fields: string[];
    data: Record<string, Record<string, number>>;
    chartTitle?: string;
    templatePath?: string;
  }

  interface MultiChartOptions {
    charts: ChartOptions[];
  }

  class XLSXChart {
    writeFile(opts: ChartOptions, callback: (err: Error | null) => void): void;
    generate(opts: ChartOptions | MultiChartOptions, callback: (err: Error | null, data: Buffer) => void): void;
  }

  export = XLSXChart;
}
