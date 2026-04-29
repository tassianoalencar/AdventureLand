const my_characters = ['MyCruell', 'RockStar', 'CruellWR', 'MerchCruell'];

function ask_character_location(character_name) {
    send_cm(character_name, "where are you?");
}

function send_character_location(character_name) {
    send_cm(character_name, { map: character.map, x: character.x, y: character.y });
}