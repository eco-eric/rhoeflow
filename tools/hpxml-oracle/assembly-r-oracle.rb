# Generates oracle values for MJ8.construction.assembly_r from OpenStudio-HPXML v1.12.0's own
# Material and Construction classes (constructions.rb, materials.rb). Run with the pinned
# OpenStudio so the classes load exactly as the oracle uses them:
#
#   openstudio tools/hpxml-oracle/assembly-r-oracle.rb <OPENSTUDIO_HPXML_DIR>/HPXMLtoOpenStudio/resources > packages/calc/fixtures/oracle/assembly-r.json
#
# For each case it (a) assembles the layers in the order of Constructions.apply_wood_stud_wall
# (walls) or Constructions.apply_wood_frame_floor_ceiling (ceilings) and reports
# Construction#assembly_rvalue, and (b) feeds that R back through the oracle's own inverse,
# Constructions.pick_wood_stud_construction_set, with the single matching construction set,
# and reports the cavity R it recovers. (b) checks (a) with code this script did not write.
require 'json'
require 'openstudio'
dir = ARGV[0] or abort('usage: openstudio assembly-r-oracle.rb <HPXMLtoOpenStudio/resources dir>')
%w[constants unit_conversions materials hpxml constructions].each { |f| require File.join(dir, f) }

def siding_material(siding)
  siding == 'none' ? nil : Material.ExteriorFinishMaterial(siding)
end

def wall_case(stud, ff, cavity_r, continuous_r, siding, osb_in = 0.5)
  int_film = Material.AirFilmIndoorWall
  ext_film = Material.AirFilmOutside
  ext_finish = siding_material(siding)
  int_finish = Material.InteriorFinishMaterial(HPXML::InteriorFinishGypsumBoard)
  stud_mat = Material.Stud2x(stud)
  depth = stud_mat.thick_in
  mat_cavity = cavity_r > 0 ? Material.new(thick_in: depth, mat_base: BaseMaterial.InsulationGenericDensepack, k_in: depth / cavity_r) : Material.AirCavityClosed(depth)
  constr = Construction.new('w', [ff, 1 - ff, 0.0])
  constr.add_layer(ext_film)
  constr.add_layer(ext_finish) unless ext_finish.nil?
  if continuous_r > 0
    t = continuous_r * BaseMaterial.InsulationRigid.k_in
    constr.add_layer(Material.new(name: 'rigid', thick_in: t, mat_base: BaseMaterial.InsulationRigid, k_in: t / continuous_r))
  end
  constr.add_layer(Material.OSBSheathing(osb_in)) if osb_in > 0
  constr.add_layer([Material.new(thick_in: depth, mat_base: BaseMaterial.Wood), mat_cavity, Material.AirCavityClosed(depth)], 'stud and cavity')
  constr.add_layer(int_finish)
  constr.add_layer(int_film)
  r = constr.assembly_rvalue
  set = WoodStudConstructionSet.new(stud_mat, ff, continuous_r, osb_in, int_finish, ext_finish)
  _match, _set, recovered = Constructions.pick_wood_stud_construction_set(r, [set], int_film, ext_film)
  { kind: 'wall', stud_nominal_in: stud, framing_factor: ff, cavity_r: cavity_r, continuous_r: continuous_r, siding: siding,
    osb_in: osb_in, interior_finish: 'gypsum board', assembly_r: r, oracle_picker_cavity_r: recovered }
end

def ceiling_case(joist, ff, cavity_r, above_r)
  film = Material.AirFilmIndoorFloorAverage
  int_finish = Material.InteriorFinishMaterial(HPXML::InteriorFinishGypsumBoard)
  joist_mat = Material.Stud2x(joist)
  h = joist_mat.thick_in
  constr = Construction.new('c', [ff, 1 - ff, 0.0])
  constr.add_layer(film)
  if cavity_r == 0
    mat_cavity = Material.AirCavityOpen(h)
  else
    if above_r > 0
      t = above_r / 3.0
      constr.add_layer(Material.new(name: 'loosefill', thick_in: t, mat_base: BaseMaterial.InsulationGenericLoosefill, k_in: t / above_r))
    end
    mat_cavity = Material.new(thick_in: h, mat_base: BaseMaterial.InsulationGenericLoosefill, k_in: h / cavity_r)
  end
  constr.add_layer([Material.new(thick_in: h, mat_base: BaseMaterial.Wood), mat_cavity, Material.AirCavityOpen(h)], 'joist and cavity')
  constr.add_layer(int_finish)
  constr.add_layer(film)
  r = constr.assembly_rvalue
  set = WoodStudConstructionSet.new(joist_mat, ff, above_r, 0.0, int_finish, nil)
  _match, _set, recovered = Constructions.pick_wood_stud_construction_set(r, [set], film, film)
  { kind: 'ceiling', stud_nominal_in: joist, framing_factor: ff, cavity_r: cavity_r, continuous_r: above_r, siding: 'none',
    osb_in: 0.0, interior_finish: 'gypsum board', assembly_r: r, oracle_picker_cavity_r: recovered }
end

cases = []
# Walls: the oracle's 2x4 16" o.c. set (framing 0.23) and 2x6 24" o.c. sets (0.20), OSB 0.5", gypsum 0.5".
%w[brick\ veneer vinyl\ siding stucco wood\ siding fiber\ cement\ siding none].each do |siding|
  [0.0, 11.0, 13.0, 15.0].each { |cav| cases << wall_case(4, 0.23, cav, 0.0, siding) }
end
[[19.0, 0.0], [21.0, 0.0], [13.0, 5.0], [21.0, 5.0], [21.0, 10.0]].each { |cav, ci| cases << wall_case(6, 0.20, cav, ci, 'brick veneer') }
cases << wall_case(4, 0.23, 13.0, 5.0, 'vinyl siding')
# Ceilings under attics: 2x4 16" o.c. joists (0.13) and 2x6 24" o.c. (0.10), gypsum 0.5", no OSB.
[[0.0, 0.0], [11.0, 0.0], [13.0, 0.0], [11.0, 8.0], [13.0, 17.0]].each { |cav, ab| cases << ceiling_case(4, 0.13, cav, ab) }
[[19.0, 0.0], [19.0, 11.0], [19.0, 19.0], [19.0, 30.0]].each { |cav, ab| cases << ceiling_case(6, 0.10, cav, ab) }

puts JSON.pretty_generate({
  generated_by: 'tools/hpxml-oracle/assembly-r-oracle.rb',
  oracle: 'OpenStudio-HPXML v1.12.0 (OpenStudio 3.11.0+241b8abb4d), constructions.rb Construction#assembly_rvalue and pick_wood_stud_construction_set',
  cases: cases
})
