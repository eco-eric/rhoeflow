# Prints the weather values the RhoeFlow engine pins per station because they come from the
# EPW's hourly data, not its header (packages/calc/src/weather/library.ts `hourlyDerived`).
#
#   openstudio tools/hpxml-oracle/station-data.rb <OPENSTUDIO_HPXML_DIR> <epw file name>
#
# Uses the pinned OpenStudio-HPXML's own WeatherFile class, so the values are the oracle's.
require 'openstudio'
hpxml_dir = ARGV[0] or abort('usage: station-data.rb <OPENSTUDIO_HPXML_DIR> <epw file name>')
epw_name = ARGV[1] || 'USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.epw'
Dir[File.join(hpxml_dir, 'HPXMLtoOpenStudio/resources/*.rb')].sort.each do |f|
  begin
    require f
  rescue Exception
    nil
  end
end
w = WeatherFile.new(epw_path: File.join(hpxml_dir, 'weather', epw_name), runner: nil)
puts({ epw: epw_name, wsf: w.data.WSF, annualAvgDrybulbF: w.data.AnnualAvgDrybulb }.inspect)
