class HelloAjaxController < ApplicationController
  def greet
    render json: {greet: "Joppa Driller greets: #{params[:name] || 'unknown person'}"}
  end
end
